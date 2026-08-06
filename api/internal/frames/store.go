// Package frames keeps whole radar frames ready, so a map request is a slice of
// memory rather than a trip to MET.
//
// THE PROBLEM IT SOLVES. Serving map windows directly from MET means fetching
// overlapping slices over and over: a national view at 1 km is 732 000 cells a
// frame, every pan asks for a different rectangle, and every user pays again.
// Twenty-four frames of that is 67 MB from MET for ONE person looking at ONE
// view, which is why the map could only afford five frames and stopped at
// +20 min.
//
// The fix is to stop slicing at the source. A whole national frame is 3.6
// million cells — only five times a national window — and once we hold it,
// EVERY window at EVERY zoom is a slice of it. So the cost stops scaling with
// users or with panning and becomes a property of the analysis: fetched once,
// shared by everyone, for the five minutes until the next one.
//
// This is yr's insight arrived at from the other side. They pre-render raster
// tiles per frame; we pre-quantise frames. Same move — do the expensive work
// once, per frame, server-side — but ours keeps "unobserved" as a symbol rather
// than a colour, which is the distinction byge cannot afford to lose.
//
// MEMORY. A quantised frame is one byte per cell, so 3.6 MB; all 24 is 87 MB
// for the newest analysis. Only the newest is kept — an older one answers a
// question nobody is asking, and the client always follows the latest stamp.
//
// FETCHED LAZILY, never on a timer. A frame costs 14 MB from MET, and pulling
// all 24 every five minutes whether or not anyone is looking would be a
// standing cost for an idle service. Someone who opens the map and never plays
// pays for one frame; the ones after it arrive as they are asked for.
package frames

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/deviationist/byge/api/internal/field"
)

// The Nordic grid, mirroring web/lib/grid.ts.
const (
	NX = 1694
	NY = 2134
	// NFrames is what the product publishes: 24 steps of five minutes, 0 to +115.
	NFrames = 24
)

// Fetcher retrieves one whole frame from upstream, already parsed.
//
// Injected rather than imported so the store can be tested without a network,
// and so the package does not need to know how a URL is built.
type Fetcher func(ctx context.Context, base string, frame int) ([]float32, error)

type Store struct {
	fetch Fetcher

	mu sync.Mutex
	// When a window was last sliced out of this store.
	//
	// The warmer reads it to decide whether warming is worth doing at all: an
	// idle service pulling 24 whole frames every five minutes is 336 MB of
	// someone else's bandwidth spent on nobody, which is not a reasonable thing
	// to do to MET. See internal/warm.
	lastUse time.Time
	// The analysis currently held. Swapping it drops every frame of the old
	// one, which is the intended eviction: a new analysis makes the previous
	// one uninteresting rather than merely older.
	base   string
	frames map[int][]byte
	// One in-flight fetch per frame, so twenty simultaneous map loads pull each
	// frame once rather than twenty times.
	inflight map[int]*call
}

type call struct {
	done chan struct{}
	data []byte
	err  error
}

func New(f Fetcher) *Store {
	return &Store{fetch: f, frames: map[int][]byte{}, inflight: map[int]*call{}}
}

// Frame returns one whole quantised national frame, fetching it if needed.
//
// The returned slice is SHARED and must not be modified — it is the cached
// copy, handed to every concurrent reader.
func (s *Store) Frame(ctx context.Context, base string, frame int) ([]byte, error) {
	if frame < 0 || frame >= NFrames {
		return nil, fmt.Errorf("frames: frame %d out of range", frame)
	}

	s.mu.Lock()
	s.lastUse = time.Now()
	if s.base != base {
		// A new analysis. Everything held is about a different moment.
		s.base = base
		s.frames = map[int][]byte{}
		s.inflight = map[int]*call{}
	}
	if got, ok := s.frames[frame]; ok {
		s.mu.Unlock()
		return got, nil
	}
	if c, ok := s.inflight[frame]; ok {
		s.mu.Unlock()
		<-c.done
		return c.data, c.err
	}
	c := &call{done: make(chan struct{})}
	s.inflight[frame] = c
	s.mu.Unlock()

	values, err := s.fetch(ctx, base, frame)
	if err == nil {
		if len(values) != NX*NY {
			err = fmt.Errorf("frames: upstream sent %d values for a whole frame, expected %d",
				len(values), NX*NY)
		} else {
			// Quantised on the way in, so the 14 MB of float32 is transient and
			// what we hold is 3.6 MB. Every reader wants bands anyway.
			b := make([]byte, NX*NY)
			for i, v := range values {
				b[i] = field.BandOf(float64(v))
			}
			c.data = b
		}
	}
	c.err = err

	s.mu.Lock()
	delete(s.inflight, frame)
	// Only cached on success. A failed fetch must not become a frame of
	// permanent silence that the map draws as clear sky.
	if err == nil && s.base == base {
		s.frames[frame] = c.data
	}
	s.mu.Unlock()

	close(c.done)
	return c.data, c.err
}

// Window is the rectangle a client asked for, in grid indices.
type Window struct {
	Row0, Col0 int
	Rows, Cols int
}

// Clamp trims a window to the grid. A map panned past the coastline is an
// ordinary thing to do; refusing it would make the edge of the data a wall.
func (w Window) Clamp() Window {
	if w.Row0 < 0 {
		w.Rows += w.Row0
		w.Row0 = 0
	}
	if w.Col0 < 0 {
		w.Cols += w.Col0
		w.Col0 = 0
	}
	if w.Row0 > NY-1 {
		w.Row0 = NY - 1
	}
	if w.Col0 > NX-1 {
		w.Col0 = NX - 1
	}
	if w.Row0+w.Rows > NY {
		w.Rows = NY - w.Row0
	}
	if w.Col0+w.Cols > NX {
		w.Cols = NX - w.Col0
	}
	if w.Rows < 1 {
		w.Rows = 1
	}
	if w.Cols < 1 {
		w.Cols = 1
	}
	return w
}

// Slice copies one window out of a whole frame.
func Slice(frame []byte, w Window) []byte {
	out := make([]byte, w.Rows*w.Cols)
	for i := 0; i < w.Rows; i++ {
		src := (w.Row0+i)*NX + w.Col0
		copy(out[i*w.Cols:(i+1)*w.Cols], frame[src:src+w.Cols])
	}
	return out
}

// UsedWithin reports whether anyone has read a frame recently. The warmer uses
// it to stay quiet while the service is idle.
func (s *Store) UsedWithin(d time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.lastUse.IsZero() && time.Since(s.lastUse) < d
}

// Held reports the analysis currently cached and how many of its frames are
// ready. Used by the warmer to skip work already done, and worth exposing for
// an operator who wants to know whether the cache is cold.
func (s *Store) Held() (base string, ready int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.base, len(s.frames)
}
