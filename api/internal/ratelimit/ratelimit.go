// Package ratelimit is a per-client token bucket.
//
// Bounds volume regardless of who is asking, which is what makes it the real
// protection here — the client key is extractable from a static bundle, so it
// deters rather than prevents. Keyed by IP for the same reason: a per-key limit
// is only as strong as the key's scarcity, and ours is not scarce.
//
// Hand-rolled rather than pulling in x/time/rate, to keep the service at zero
// dependencies. A token bucket is thirty lines and the semantics are the part
// that matters, not the implementation.
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens per second
	burst   float64
	now     func() time.Time
}

// New builds a limiter allowing `perMinute` sustained requests with `burst`
// available immediately.
func New(perMinute, burst int) *Limiter {
	return &Limiter{
		buckets: make(map[string]*bucket),
		rate:    float64(perMinute) / 60,
		burst:   float64(burst),
		now:     time.Now,
	}
}

// Allow reports whether this key may proceed, consuming a token if so.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		// New clients start full, so a first visit is never throttled.
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		b.tokens += now.Sub(b.last).Seconds() * l.rate
		if b.tokens > l.burst {
			b.tokens = l.burst
		}
		b.last = now
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// Sweep drops buckets that have sat full and untouched, so the map cannot grow
// without bound. A full bucket carries no state worth keeping — recreating it
// gives exactly the same answer.
func (l *Limiter) Sweep(idle time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-idle)
	for k, b := range l.buckets {
		if b.last.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

// Len reports how many clients are being tracked. For the health endpoint.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
