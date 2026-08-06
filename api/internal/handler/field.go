package handler

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"

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
	// FETCHED IN PARALLEL, because they are independent and the sequential
	// version was the single slowest thing in the app: 24 cold frames at about
	// 400 ms each is 9.4 seconds of staring at an empty map. Concurrency is
	// bounded here as well as in the upstream client — that semaphore protects
	// MET from us, this one stops one map request monopolising it and starving
	// every verdict on the site.
	//
	// The store coalesces, so overlapping requests for the same frame still
	// make one upstream call however many goroutines ask.
	type result struct {
		cells []byte
		err   error
	}
	results := make([]result, count)
	sem := make(chan struct{}, frameFanout)
	var wg sync.WaitGroup
	for f := 0; f < count; f++ {
		wg.Add(1)
		go func(f int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			whole, err := h.frames.Frame(r.Context(), base, f)
			if err != nil {
				results[f].err = err
				return
			}
			results[f].cells = frames.Slice(whole, win)
		}(f)
	}
	wg.Wait()

	// Truncated at the first failure rather than skipped over: frame 7 missing
	// from a run of 24 would leave the client animating a gap it cannot see,
	// where a short run is simply a shorter animation and the header says so.
	body := make([]byte, 0, win.Rows*win.Cols*count)
	for f := 0; f < count; f++ {
		if results[f].err != nil {
			if errors.Is(results[f].err, context.Canceled) {
				return
			}
			// The window is NOT logged: grid indices are a coordinate in
			// another spelling.
			h.log.Error("frame fetch failed", "frame", f, "err", results[f].err)
			if f == 0 {
				http.Error(w, "could not reach the radar", http.StatusBadGateway)
				return
			}
			count = f
			break
		}
		body = append(body, results[f].cells...)
	}

	payload, err := field.EncodeBands(field.Header{
		Frames: uint16(count),
		Width:  uint16(win.Cols),
		Height: uint16(win.Rows),
		Row0:   int32(win.Row0),
		Col0:   int32(win.Col0),
		Stride: 1,
	}, body)
	if err != nil {
		h.log.Error("field encode failed", "err", err)
		http.Error(w, "could not encode the radar field", http.StatusInternalServerError)
		return
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
	if _, err := gz.Write(payload); err != nil {
		h.log.Error("field write failed", "err", err)
	}
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
