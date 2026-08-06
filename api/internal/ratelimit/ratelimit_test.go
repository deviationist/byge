package ratelimit

import (
	"sync"
	"testing"
	"time"
)

func TestBurstIsAvailableImmediately(t *testing.T) {
	// A first visit must never be throttled — the app opens and fetches several
	// places at once, and that is normal use rather than abuse.
	l := New(60, 10)
	for i := range 10 {
		if !l.Allow("a") {
			t.Fatalf("request %d denied inside the burst", i+1)
		}
	}
	if l.Allow("a") {
		t.Fatal("burst was not enforced")
	}
}

func TestTokensRefillOverTime(t *testing.T) {
	l := New(60, 5) // one per second
	base := time.Now()
	l.now = func() time.Time { return base }
	for range 5 {
		l.Allow("a")
	}
	if l.Allow("a") {
		t.Fatal("should be empty")
	}
	l.now = func() time.Time { return base.Add(3 * time.Second) }
	for i := range 3 {
		if !l.Allow("a") {
			t.Fatalf("refill %d denied after 3s at 1/s", i+1)
		}
	}
	if l.Allow("a") {
		t.Fatal("refilled beyond what elapsed")
	}
}

func TestRefillIsCappedAtBurst(t *testing.T) {
	// An idle client must not bank credit and then flood.
	l := New(60, 5)
	base := time.Now()
	l.now = func() time.Time { return base }
	l.Allow("a")
	l.now = func() time.Time { return base.Add(time.Hour) }
	n := 0
	for l.Allow("a") {
		n++
		if n > 100 {
			t.Fatal("bucket refilled without limit")
		}
	}
	if n != 5 {
		t.Fatalf("allowed %d after an idle hour, want burst of 5", n)
	}
}

func TestClientsAreIndependent(t *testing.T) {
	// One noisy client must not throttle everyone else behind the same proxy.
	l := New(60, 2)
	l.Allow("a")
	l.Allow("a")
	if l.Allow("a") {
		t.Fatal("a should be exhausted")
	}
	if !l.Allow("b") {
		t.Fatal("b was throttled by a's usage")
	}
}

func TestSweepDropsIdleClientsOnly(t *testing.T) {
	l := New(60, 5)
	base := time.Now()
	l.now = func() time.Time { return base }
	l.Allow("old")
	l.now = func() time.Time { return base.Add(time.Hour) }
	l.Allow("fresh")
	l.Sweep(30 * time.Minute)
	if l.Len() != 1 {
		t.Fatalf("tracking %d clients after sweep, want 1", l.Len())
	}
	if !l.Allow("fresh") {
		t.Fatal("the active client was swept")
	}
}

func TestConcurrentUseIsSafe(t *testing.T) {
	l := New(6000, 500)
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 10 {
				l.Allow("shared")
			}
		}()
	}
	wg.Wait() // -race is what actually asserts here
}
