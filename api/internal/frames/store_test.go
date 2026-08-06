package frames

import (
	"context"
	"errors"
	"sync"
	"testing"
)

/**
 * The store exists so a map window is a slice of memory rather than a trip to
 * MET. Every test here is about that promise holding under the things that
 * break caches: concurrency, failure, and a new analysis arriving.
 */

func whole(v float32) []float32 {
	out := make([]float32, NX*NY)
	for i := range out {
		out[i] = v
	}
	return out
}

func TestFetchesAFrameOnlyOnce(t *testing.T) {
	var calls int
	var mu sync.Mutex
	s := New(func(_ context.Context, _ string, _ int) ([]float32, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		return whole(2.0), nil
	})
	for i := 0; i < 5; i++ {
		if _, err := s.Frame(context.Background(), "a", 3); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Errorf("fetched %d times, want 1 — the whole point is that a window is free after the first", calls)
	}
}

func TestCollapsesSimultaneousFirstRequests(t *testing.T) {
	// Twenty map loads at once must pull each frame once, not twenty times.
	// Without coalescing the store makes the stampede it exists to prevent.
	var calls int
	var mu sync.Mutex
	release := make(chan struct{})
	s := New(func(_ context.Context, _ string, _ int) ([]float32, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		<-release
		return whole(1.0), nil
	})

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = s.Frame(context.Background(), "a", 0)
		}()
	}
	// Give them time to pile up on the same frame.
	for {
		mu.Lock()
		started := calls > 0
		mu.Unlock()
		if started {
			break
		}
	}
	close(release)
	wg.Wait()

	if calls != 1 {
		t.Errorf("fetched %d times under concurrency, want 1", calls)
	}
}

func TestDropsEverythingWhenTheAnalysisChanges(t *testing.T) {
	// A new analysis makes the old frames uninteresting rather than merely
	// older. Serving one against the new stamp would show weather from five
	// minutes ago as if it were now.
	var seen []string
	s := New(func(_ context.Context, base string, _ int) ([]float32, error) {
		seen = append(seen, base)
		return whole(1.0), nil
	})
	_, _ = s.Frame(context.Background(), "old", 0)
	_, _ = s.Frame(context.Background(), "new", 0)
	_, _ = s.Frame(context.Background(), "new", 0)

	if len(seen) != 2 || seen[0] != "old" || seen[1] != "new" {
		t.Errorf("fetches were %v, want one per analysis", seen)
	}
}

func TestNeverCachesAFailure(t *testing.T) {
	// A failed fetch cached as a frame is permanent silence, and this layer
	// draws silence as clear sky.
	var calls int
	s := New(func(_ context.Context, _ string, _ int) ([]float32, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("upstream down")
		}
		return whole(3.0), nil
	})
	if _, err := s.Frame(context.Background(), "a", 0); err == nil {
		t.Fatal("expected the first fetch to fail")
	}
	if _, err := s.Frame(context.Background(), "a", 0); err != nil {
		t.Fatalf("retry failed: %v — a failure was cached", err)
	}
}

func TestRefusesAShortFrame(t *testing.T) {
	// A partial frame would be sliced into a window of the wrong shape and
	// drawn as a real, wrongly-placed field.
	s := New(func(_ context.Context, _ string, _ int) ([]float32, error) {
		return make([]float32, 10), nil
	})
	if _, err := s.Frame(context.Background(), "a", 0); err == nil {
		t.Fatal("a short frame was accepted")
	}
}

func TestRejectsFramesOutsideTheProduct(t *testing.T) {
	s := New(func(_ context.Context, _ string, _ int) ([]float32, error) { return whole(0), nil })
	if _, err := s.Frame(context.Background(), "a", NFrames); err == nil {
		t.Error("frame past the horizon was accepted")
	}
	if _, err := s.Frame(context.Background(), "a", -1); err == nil {
		t.Error("negative frame was accepted")
	}
}

func TestSliceReadsTheRightRectangle(t *testing.T) {
	// A transposed or offset slice draws a real-looking field over the wrong
	// part of the country, and nothing throws.
	frame := make([]byte, NX*NY)
	frame[10*NX+20] = 5
	frame[11*NX+21] = 6

	got := Slice(frame, Window{Row0: 10, Col0: 20, Rows: 2, Cols: 2})
	if got[0] != 5 {
		t.Errorf("top-left = %d, want 5", got[0])
	}
	if got[3] != 6 {
		t.Errorf("bottom-right = %d, want 6", got[3])
	}
	if got[1] != 0 || got[2] != 0 {
		t.Error("off-diagonal cells should be empty — the slice is misaligned")
	}
}

func TestClampKeepsAWindowInsideTheGrid(t *testing.T) {
	// A map panned past the coastline is ordinary. Refusing it would make the
	// edge of the data a wall; reading past it would panic.
	w := Window{Row0: -50, Col0: -50, Rows: 100, Cols: 100}.Clamp()
	if w.Row0 != 0 || w.Col0 != 0 {
		t.Errorf("negative origin not clamped: %+v", w)
	}

	w = Window{Row0: NY - 10, Col0: NX - 10, Rows: 500, Cols: 500}.Clamp()
	if w.Row0+w.Rows > NY || w.Col0+w.Cols > NX {
		t.Errorf("window runs past the grid: %+v", w)
	}
	if w.Rows < 1 || w.Cols < 1 {
		t.Errorf("clamped to nothing: %+v", w)
	}
}
