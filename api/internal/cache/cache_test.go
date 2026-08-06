package cache

import (
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func ok(body string) Entry {
	return Entry{Status: http.StatusOK, ContentType: "text/plain", Body: []byte(body)}
}

func notFound() Entry {
	return Entry{Status: http.StatusNotFound, ContentType: "text/plain", Body: []byte("no")}
}

func TestServesFromCacheWithoutRefetching(t *testing.T) {
	c := New(time.Hour, time.Second, 1<<20)
	var calls atomic.Int32
	fetch := func() (Entry, error) { calls.Add(1); return ok("data"), nil }

	if _, hit, _ := c.Do("k", fetch); hit {
		t.Fatal("first call should be a miss")
	}
	if _, hit, _ := c.Do("k", fetch); !hit {
		t.Fatal("second call should be a hit")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream called %d times, want 1 — the point of the cache is that MET sees one request", got)
	}
}

func TestSuccessOutlivesThePublishInterval(t *testing.T) {
	// A 200 is immutable: the analysis timestamp is in the URL, so those bytes
	// never change. Expiring them on the publish cadence would re-fetch
	// identical data every five minutes for nothing.
	c := New(time.Hour, time.Second, 1<<20)
	base := time.Now()
	c.now = func() time.Time { return base }
	var calls atomic.Int32
	fetch := func() (Entry, error) { calls.Add(1); return ok("data"), nil }

	c.Do("k", fetch)
	c.now = func() time.Time { return base.Add(30 * time.Minute) }
	if _, hit, _ := c.Do("k", fetch); !hit {
		t.Fatal("a 200 should still be cached half an hour later")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream called %d times, want 1", got)
	}
}

func TestNotFoundExpiresQuicklySoANewAnalysisIsNoticed(t *testing.T) {
	// A 404 means "not published yet" and WILL flip to 200. Holding it for the
	// full publish interval would leave the app blind to a fresh frame; this is
	// the only knob that governs that latency.
	c := New(time.Hour, 30*time.Second, 1<<20)
	base := time.Now()
	c.now = func() time.Time { return base }
	var calls atomic.Int32
	fetch := func() (Entry, error) { calls.Add(1); return notFound(), nil }

	c.Do("k", fetch)
	if _, hit, _ := c.Do("k", fetch); !hit {
		t.Fatal("a 404 should be cached briefly, so probes collapse")
	}
	c.now = func() time.Time { return base.Add(31 * time.Second) }
	if _, hit, _ := c.Do("k", fetch); hit {
		t.Fatal("a 404 must expire quickly — otherwise a published analysis stays invisible")
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("upstream called %d times, want 2", got)
	}
}

func TestErrorsAreNotCached(t *testing.T) {
	// Caching a 5xx turns an upstream blip into an outage that outlasts it.
	c := New(time.Hour, time.Minute, 1<<20)
	var calls atomic.Int32
	fetch := func() (Entry, error) {
		calls.Add(1)
		return Entry{Status: http.StatusBadGateway, Body: []byte("boom")}, nil
	}
	c.Do("k", fetch)
	c.Do("k", fetch)
	if got := calls.Load(); got != 2 {
		t.Fatalf("upstream called %d times, want 2 — a 502 must not stick", got)
	}
}

func TestConcurrentMissesCollapseIntoOneUpstreamRequest(t *testing.T) {
	// Several saved places refreshing at once, cold cache. Without coalescing
	// this is exactly the burst the cache exists to prevent.
	c := New(time.Hour, time.Minute, 1<<20)
	var calls atomic.Int32
	release := make(chan struct{})
	fetch := func() (Entry, error) {
		calls.Add(1)
		<-release
		return ok("data"), nil
	}

	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() { defer wg.Done(); c.Do("same", fetch) }()
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream called %d times, want 1 — concurrent misses must coalesce", got)
	}
}

func TestFailedFetchPropagatesToEveryWaiter(t *testing.T) {
	c := New(time.Hour, time.Minute, 1<<20)
	want := errors.New("upstream down")
	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := c.Do("k", func() (Entry, error) { return Entry{}, want })
			errs[i] = err
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if !errors.Is(err, want) {
			t.Fatalf("waiter %d got %v, want the upstream error — a coalesced failure must not read as success", i, err)
		}
	}
}

func TestEvictsToStayWithinBudget(t *testing.T) {
	// Keys are per-coordinate, so an unbounded map is how a stateless service
	// quietly becomes a memory leak.
	c := New(time.Hour, time.Minute, 100)
	for _, k := range []string{"a", "b", "c", "d", "e"} {
		c.Do(k, func() (Entry, error) { return ok("0123456789012345678901234567890"), nil })
	}
	_, bytes := c.Stats()
	if bytes > 100 {
		t.Fatalf("cache holds %d bytes, over the 100-byte budget", bytes)
	}
}

func TestOversizedResponseIsNotStored(t *testing.T) {
	c := New(time.Hour, time.Minute, 8)
	c.Do("big", func() (Entry, error) { return ok("far larger than the budget"), nil })
	entries, bytes := c.Stats()
	if entries != 0 || bytes != 0 {
		t.Fatalf("stored %d entries / %d bytes; one oversized body must not evict everything else", entries, bytes)
	}
}
