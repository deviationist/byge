// Package cache is a bounded, in-memory response cache with request
// coalescing.
//
// It exists to keep pressure off MET rather than to make byge fast. Every
// client that asks for the same analysis frame within its lifetime should cost
// MET exactly one request — and because the app refreshes on a five-minute
// interval while the analysis publishes on roughly the same cadence, most
// refreshes are answerable from here.
//
// Deliberately in-memory and unshared: this service is stateless, so a restart
// simply re-warms. Adding Redis would buy a warmer cache at the cost of the
// property that makes this thing easy to reason about.
package cache

import (
	"net/http"
	"sync"
	"time"
)

type Entry struct {
	Status      int
	ContentType string
	Body        []byte
}

type item struct {
	entry   Entry
	expires time.Time
}

type Cache struct {
	mu       sync.Mutex
	items    map[string]item
	inflight map[string]*call
	bytes    int64
	maxBytes int64
	ttlOK    time.Duration
	ttlMiss  time.Duration
	now      func() time.Time
}

// call is one in-flight fetch that later arrivals wait on rather than
// duplicating. Without this, a cold cache plus several places refreshing at
// once turns into several identical requests to MET — precisely the burst the
// cache is meant to prevent.
type call struct {
	wg    sync.WaitGroup
	entry Entry
	err   error
}

func New(ttlOK, ttlMiss time.Duration, maxBytes int64) *Cache {
	return &Cache{
		items:    make(map[string]item),
		inflight: make(map[string]*call),
		maxBytes: maxBytes,
		ttlOK:    ttlOK,
		ttlMiss:  ttlMiss,
		now:      time.Now,
	}
}

// Do returns the cached entry for key, or calls fetch exactly once for
// concurrent callers that miss.
func (c *Cache) Do(key string, fetch func() (Entry, error)) (Entry, bool, error) {
	c.mu.Lock()
	if it, ok := c.items[key]; ok && c.now().Before(it.expires) {
		c.mu.Unlock()
		return it.entry, true, nil
	}
	if cl, ok := c.inflight[key]; ok {
		// Someone else is already asking MET for this. Wait for their answer
		// instead of asking again.
		c.mu.Unlock()
		cl.wg.Wait()
		return cl.entry, false, cl.err
	}
	cl := &call{}
	cl.wg.Add(1)
	c.inflight[key] = cl
	c.mu.Unlock()

	cl.entry, cl.err = fetch()
	cl.wg.Done()

	c.mu.Lock()
	delete(c.inflight, key)
	if cl.err == nil {
		// 200s are immutable — the timestamp is in the URL — so they keep the
		// long TTL. 404s mean "not published yet" and get the short one, which
		// is what makes a new analysis visible promptly while still collapsing
		// every client's probe into roughly one upstream request per window.
		// Anything else (5xx, a redirect we did not expect) is not cached at
		// all: caching an error turns a blip into an outage.
		switch cl.entry.Status {
		case http.StatusOK:
			c.store(key, cl.entry, c.ttlOK)
		case http.StatusNotFound:
			c.store(key, cl.entry, c.ttlMiss)
		}
	}
	c.mu.Unlock()

	return cl.entry, false, cl.err
}

// store assumes the lock is held.
func (c *Cache) store(key string, e Entry, ttl time.Duration) {
	size := int64(len(e.Body))
	if size > c.maxBytes {
		// A single response larger than the whole budget is not worth evicting
		// everything else for.
		return
	}
	if old, ok := c.items[key]; ok {
		c.bytes -= int64(len(old.entry.Body))
	}
	c.items[key] = item{entry: e, expires: c.now().Add(ttl)}
	c.bytes += size
	c.evict()
}

// evict drops expired entries first, then oldest-expiring ones, until the
// budget is met. Expiry-ordered rather than LRU because everything here has the
// same short lifetime — the entry closest to expiring is the one whose loss
// costs least.
func (c *Cache) evict() {
	if c.bytes <= c.maxBytes {
		return
	}
	now := c.now()
	for k, it := range c.items {
		if now.After(it.expires) {
			c.bytes -= int64(len(it.entry.Body))
			delete(c.items, k)
		}
	}
	for c.bytes > c.maxBytes {
		var oldestKey string
		var oldest time.Time
		for k, it := range c.items {
			if oldestKey == "" || it.expires.Before(oldest) {
				oldestKey, oldest = k, it.expires
			}
		}
		if oldestKey == "" {
			return
		}
		c.bytes -= int64(len(c.items[oldestKey].entry.Body))
		delete(c.items, oldestKey)
	}
}

// Stats reports what the cache is holding. Used by the health endpoint, so
// "is it actually caching?" is answerable without a profiler.
func (c *Cache) Stats() (entries int, bytes int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items), c.bytes
}
