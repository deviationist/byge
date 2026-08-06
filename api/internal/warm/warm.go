// Package warm keeps the frame store ahead of the people using it.
//
// WHY. A cold store makes the first visitor after each analysis pay for every
// frame they scrub to — 14 MB and about half a second each, arriving one at a
// time while they drag. Warming moves that cost off the critical path: by the
// time anyone asks, the frames are already bytes in memory.
//
// WHY IT IS DEMAND-DRIVEN, and this is the part worth arguing about. Twenty-four
// whole frames is roughly 340 MB from MET, and a new analysis lands every five
// minutes. Warming unconditionally would pull that continuously whether or not
// a single person had the map open — about a megabyte a second, forever, taken
// from an organisation that gives this data away. That is not a reasonable
// thing to do to a public service, and no user is better off for it.
//
// So the warmer only runs while the map is actually in use. An idle byge costs
// MET nothing; an active one is always warm. The first visitor after a quiet
// period still pays for frame 0, which is one fetch, and everything after that
// is ahead of them.
//
// SYNCED TO THE PRODUCT, not to the clock. Analyses are stamped every five
// minutes but publish late and irregularly — measured between five and fifteen
// minutes behind the stamp — so a five-minute ticker aligned to the hour would
// spend most of its wakeups asking for files that do not exist yet. It polls
// more often than that, cheaply, and does the expensive part only when the
// stamp it finds is one it has not already warmed.
package warm

import (
	"context"
	"log/slog"
	"time"

	"github.com/deviationist/byge/api/internal/frames"
)

type Options struct {
	// How often to look for a newer analysis. Cheap — it is a metadata request
	// that the response cache absorbs.
	Poll time.Duration
	// How recently the map must have been used for warming to run at all.
	// Generous, because someone reading a map goes quiet while they read it.
	Active time.Duration
	// How many of the 24 frames to pull ahead. All of them means the full
	// 115-minute run plays without a stall; fewer trades that for bandwidth.
	Frames int
	// Pause between frame fetches, so warming stays in the background rather
	// than becoming a burst of two dozen simultaneous 14 MB requests.
	Spacing time.Duration
}

func Defaults() Options {
	return Options{Poll: 60 * time.Second, Active: 15 * time.Minute, Frames: frames.NFrames, Spacing: 250 * time.Millisecond}
}

// Latest resolves the newest published analysis. Injected so the warmer does
// not need to know how MET names its files.
type Latest func(ctx context.Context) (base string, err error)

type Warmer struct {
	store  *frames.Store
	latest Latest
	opts   Options
	log    *slog.Logger
}

func New(s *frames.Store, latest Latest, opts Options, log *slog.Logger) *Warmer {
	return &Warmer{store: s, latest: latest, opts: opts, log: log}
}

// Run warms until the context is cancelled. Intended as `go w.Run(ctx)`.
func (w *Warmer) Run(ctx context.Context) {
	if w.opts.Frames <= 0 {
		w.log.Info("frame warming disabled")
		return
	}
	t := time.NewTicker(w.opts.Poll)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			w.tick(ctx)
		}
	}
}

func (w *Warmer) tick(ctx context.Context) {
	// Idle: nothing to be ready for.
	if !w.store.UsedWithin(w.opts.Active) {
		return
	}

	base, err := w.latest(ctx)
	if err != nil {
		// Expected regularly — the newest stamp routinely has not published
		// yet. Debug rather than error, or the log becomes noise nobody reads.
		w.log.Debug("warm: no analysis available", "err", err)
		return
	}

	held, ready := w.store.Held()
	if held == base && ready >= w.opts.Frames {
		return // already warm
	}

	go w.fill(ctx, base)
}

func (w *Warmer) fill(ctx context.Context, base string) {
	start := time.Now()
	var got int
	for f := 0; f < w.opts.Frames; f++ {
		select {
		case <-ctx.Done():
			return
		default:
		}
		// A newer analysis arriving mid-fill makes the rest of this pointless:
		// the store has already dropped what we put in it.
		if held, _ := w.store.Held(); held != "" && held != base {
			return
		}
		if _, err := w.store.Frame(ctx, base, f); err != nil {
			w.log.Warn("warm: frame failed", "frame", f, "err", err)
			return
		}
		got++
		if w.opts.Spacing > 0 {
			time.Sleep(w.opts.Spacing)
		}
	}
	w.log.Info("warm: analysis ready", "frames", got, "took", time.Since(start).Round(time.Millisecond))
}
