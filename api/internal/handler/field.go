package handler

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/deviationist/byge/api/internal/field"
	"github.com/deviationist/byge/api/internal/frames"
)

// The largest response worth sending: 24 frames of a national window is about
// 17.6 million cells, which gzips to roughly 900 KB. Beyond that a client is
// asking for more than a screen can show.
const maxFieldCells = 20_000_000

// How many whole frames to pull from MET at once for a single request.
//
// Below the upstream client's own limit on purpose. That one exists to protect
// MET from the service; this one exists to stop ONE map request consuming the
// whole allowance and leaving every verdict on the site queued behind it.
const frameFanout = 5

// field serves a window of the radar grid as one byte per cell.
//
// WHY THIS EXISTS ALONGSIDE /slab. `/slab` relays exactly what MET sent, which
// is float32, which for one national frame is 14 MB uncompressed — MET serves
// no gzip, verified. That is right for the verdict, which reads a 51×51 window
// and needs the real numbers to build a sentence out of. It is hopeless for a
// map you pan across a country.
//
// This endpoint is the opposite trade, and it is the only place in the service
// that INTERPRETS the data rather than forwarding it. It quantises each cell to
// its band and gzips the result: ~100 KB for the whole mosaic, 140× smaller
// than the source. See package field for why bands rather than rendered tiles.
//
// It takes GRID INDICES, not coordinates. The client already computes the
// window — it has the projection, because it needs it to place the cells — and
// duplicating that maths here would create two answers to "which cell is this"
// that could drift. The server's job is the part the browser cannot do: reach
// MET with an identifying agent, and shrink the result.
func (h *Handler) field(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	if !h.authorised(r) {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}
	if !h.limiter.Allow(h.clientIP(r)) {
		http.Error(w, "slow down", http.StatusTooManyRequests)
		return
	}

	q := r.URL.Query()
	stamp := q.Get("stamp")
	if !stampRe.MatchString(stamp) {
		http.Error(w, "malformed stamp", http.StatusBadRequest)
		return
	}
	base := DatasetBase(stamp)

	row0, err1 := intParam(q.Get("row0"))
	col0, err2 := intParam(q.Get("col0"))
	rows, err3 := intParam(q.Get("rows"))
	cols, err4 := intParam(q.Get("cols"))
	count, err5 := intParam(q.Get("frames"))
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil {
		http.Error(w, "malformed window parameters", http.StatusBadRequest)
		return
	}

	win := frames.Window{Row0: row0, Col0: col0, Rows: rows, Cols: cols}.Clamp()
	if count < 1 {
		count = 1
	}
	if count > frames.NFrames {
		count = frames.NFrames
	}

	// The only cap left, and it bounds the RESPONSE rather than MET's work.
	// Nothing here can ask MET for more than a whole frame — the store already
	// holds those — so the question is no longer "how much will this cost
	// upstream" but "how much is reasonable to send".
	if win.Rows*win.Cols*count > maxFieldCells {
		http.Error(w, "window too large", http.StatusBadRequest)
		return
	}

	// Sliced out of whole frames the store already has, or fetches once.
	//
	// FRAME 0 GOES FIRST, ALONE, and that ordering is the whole reason streaming
	// is worth anything. A whole national frame is 14 MB from MET, and the link
	// — not MET — is the bottleneck: five of them in parallel each take five
	// times as long. When the response could not begin until it was finished
	// that cost nothing, because all 24 had to land anyway. Streaming changes
	// what the reader waits for to the FIRST frame, so sharing the pipe with 23
	// frames nobody is looking at yet makes the only number that matters five
	// times worse. Measured cold, frame 0 arrived at 8.3 s under the old fan-out
	// and at about 1.7 s on its own.
	whole0, err := h.frames.Frame(r.Context(), base, 0)
	if err != nil {
		// Nothing has been written, so a status code is still ours to choose —
		// which is the other reason frame 0 is handled apart. Once a byte of body
		// has gone out the status is committed and a later failure can only stop
		// the stream short; it cannot become a 502.
		if errors.Is(err, context.Canceled) {
			return
		}
		// The window is NOT logged: grid indices are a coordinate in another
		// spelling.
		h.log.Error("frame fetch failed", "frame", 0, "err", err)
		http.Error(w, "could not reach the radar", http.StatusBadGateway)
		return
	}

	// THE REST FAN OUT, because now they are behind something already on screen
	// and throughput matters more than any one of their latencies. Concurrency
	// is bounded here as well as in the upstream client — that semaphore
	// protects MET from us, this one stops one map request monopolising it and
	// starving every verdict on the site.
	//
	// The store coalesces, so overlapping requests for the same frame still make
	// one upstream call however many goroutines ask.
	//
	// Each goroutine closes its own `done` channel, so the writer below can send
	// frames IN ORDER as they finish without waiting for the slowest.
	type result struct {
		cells []byte
		err   error
		done  chan struct{}
	}
	results := make([]result, count)
	results[0] = result{cells: frames.Slice(whole0, win), done: closed()}
	for f := 1; f < count; f++ {
		results[f].done = make(chan struct{})
	}
	sem := make(chan struct{}, frameFanout)
	for f := 1; f < count; f++ {
		go func(f int) {
			defer close(results[f].done)
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-r.Context().Done():
				results[f].err = r.Context().Err()
				return
			}
			whole, err := h.frames.Frame(r.Context(), base, f)
			if err != nil {
				results[f].err = err
				return
			}
			results[f].cells = frames.Slice(whole, win)
		}(f)
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Encoding", "gzip")
	// Compressed here rather than by a middleware, because the ratio is the
	// entire point of the endpoint and it should not depend on whatever sits in
	// front of it in production. Consecutive frames of a rain field are very
	// alike, so gzipping them together costs far less than the sum of each.
	//
	// LEVEL 5, not BestCompression, measured on a real 24-frame national
	// payload rather than guessed:
	//
	//	level 1   1147 KB    42 ms
	//	level 5    963 KB   109 ms
	//	level 6    917 KB   229 ms
	//	level 9    862 KB  2643 ms
	//
	// BestCompression spends two and a half SECONDS to save a tenth of the
	// bytes, on a request somebody is waiting for in front of a map they want
	// to pan. It was the default this endpoint shipped with, and it was the
	// slowest thing in the whole path.
	gz, _ := gzip.NewWriterLevel(w, 5)
	defer gz.Close()

	// STREAMED, ONE FRAME AT A TIME.
	//
	// The whole run used to be assembled, encoded and gzipped before a single
	// byte left — so the reader waited on the SLOWEST frame to see the first
	// one, and on a cold store that was seconds of an empty map with a playback
	// control that had nothing to play. Frames are independent and arrive out of
	// order; there is no reason the reader should wait for frame 23 to look at
	// frame 0.
	//
	// The header states the intended count and goes out immediately, so the
	// client knows the window's shape and how much is coming. It then paints
	// each frame as it lands and can start playing long before the run is in.
	//
	// `gz.Flush` is a sync flush, NOT a reset: the deflate history carries
	// across frames, so consecutive frames of a rain field still compress
	// against each other and the ratio the endpoint exists for is intact. What
	// it costs is a few bytes of block boundary per frame.
	flusher, _ := w.(http.Flusher)
	push := func(b []byte) bool {
		if _, err := gz.Write(b); err != nil {
			return false
		}
		if err := gz.Flush(); err != nil {
			return false
		}
		if flusher != nil {
			flusher.Flush()
		}
		return true
	}

	if !push(field.HeaderBytes(field.Header{
		Frames: uint16(count),
		Width:  uint16(win.Cols),
		Height: uint16(win.Rows),
		Row0:   int32(win.Row0),
		Col0:   int32(win.Col0),
		Stride: 1,
	})) {
		return
	}

	for f := 0; f < count; f++ {
		select {
		case <-results[f].done:
		case <-r.Context().Done():
			return
		}
		// TRUNCATED AT THE FIRST FAILURE rather than skipped over. Frame 7
		// missing from a run of 24 would leave the client animating a gap it
		// cannot see; a short run is simply a shorter animation.
		//
		// The header cannot be corrected — it left before this was knowable —
		// so the client counts the frames it actually received rather than
		// trusting the count. That is the same arithmetic it does while the
		// stream is still open, so a truncated run and an in-progress one are
		// the same case and neither needs special handling.
		if results[f].err != nil {
			if !errors.Is(results[f].err, context.Canceled) {
				h.log.Error("frame fetch failed", "frame", f, "err", results[f].err)
			}
			return
		}
		if !push(results[f].cells) {
			return
		}
	}
}

/** An already-closed channel, so frame 0 slots into the same wait as the rest. */
func closed() chan struct{} {
	c := make(chan struct{})
	close(c)
	return c
}

func intParam(s string) (int, error) {
	if s == "" {
		return 0, fmt.Errorf("missing")
	}
	return strconv.Atoi(s)
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
