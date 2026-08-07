package handler

import (
	"compress/gzip"
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/deviationist/byge/api/internal/field"
	"github.com/deviationist/byge/api/internal/frames"
)

// How many whole frames to pull from MET at once for a single request.
//
// Below the upstream client's own limit on purpose. That one exists to protect
// MET from the service; this one exists to stop ONE map request consuming the
// whole allowance and leaving every verdict on the site queued behind it.
const frameFanout = 5

// The most tiles one request may name.
//
// A national viewport is about 100 tiles at 128 cells, so this admits the
// widest honest view with room to spare, and refuses a caller who wants to
// enumerate the whole lattice across every frame in one go. It also bounds the
// URL, which is the other thing a list-shaped parameter can run away with.
const maxTilesPerRequest = 160

/**
 * Coarsest pyramid level served. 2 is four grid cells per texel, which puts the
 * whole national lattice inside about fifteen tiles — a full 24-frame run for
 * less memory than twelve frames cost at level 0.
 */
const maxTileLevel = 2

// tiles serves a LIST of grid-aligned tiles rather than a rectangle.
//
// WHY A LIST. This replaced `/field`, which answered with the rectangle you were
// looking at — so panning refetched the ninety per cent that had not moved, and
// zooming out refetched the middle of the screen entirely. The client could not
// ask for less, because a rectangle minus its middle is not a rectangle. A list
// expresses exactly the set difference between "what I need" and "what I hold",
// so a tile is fetched once and then never again while it is worth keeping.
//
// The server is well placed for this: it already holds whole national frames in
// memory, so a tile is a slice, and slicing 40 tiles out of one frame costs no
// more upstream than slicing one.
//
// FRAME-MAJOR STREAMING. The whole run used to be assembled, encoded and gzipped
// before a single byte left, so the reader waited on the SLOWEST frame to see
// the first one. Frames are independent and arrive out of order; there is no
// reason to wait for frame 23 to look at frame 0. Here the header goes out
// immediately and each frame is flushed as it lands — and every tile of frame 0
// goes out before any tile of frame 1, so the reader gets a complete picture of
// NOW as early as possible and gains time depth after. The reverse order would
// deliver a full two-hour animation of one corner of the screen.
//
// `gz.Flush` is a sync flush, NOT a reset: the deflate history carries across
// frames, so consecutive frames of a rain field still compress against each
// other. What it costs is a few bytes of block boundary per frame.
func (h *Handler) tiles(w http.ResponseWriter, r *http.Request) {
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

	count, err := intParam(q.Get("frames"))
	if err != nil {
		http.Error(w, "malformed frames", http.StatusBadRequest)
		return
	}
	count = clamp(count, 1, frames.NFrames)

	// The pyramid level. 0 is one texel per grid cell; each level up covers
	// twice the ground per texel, so a wide view needs quadratically fewer
	// tiles and can afford the WHOLE RUN. Bounded because the level scales the
	// read stride and an absurd one would ask for cells far off the grid.
	level, err := intParam(q.Get("level"))
	if err != nil {
		level = 0
	}
	level = clamp(level, 0, maxTileLevel)

	list, err := parseTiles(q.Get("tiles"), level)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// FRAME 0 ALONE, THEN THE REST, and the ordering is the whole reason
	// streaming is worth anything. A whole national frame is 14 MB from MET and
	// the LINK is the bottleneck, so five in parallel each take five times as
	// long. When the response could not begin until it was finished that cost
	// nothing — all of them had to land anyway. Streaming changes what the reader
	// waits for to the FIRST frame, so sharing the pipe with 23 nobody is looking
	// at yet makes the only number that matters five times worse. Measured cold:
	// frame 0 at 8.33 s under a flat fan-out, 0.45 s on its own.
	whole0, err := h.frames.Frame(r.Context(), base, 0)
	if err != nil {
		// Still ours to choose a status: nothing has been written yet.
		if errors.Is(err, context.Canceled) {
			return
		}
		// The tile list is NOT logged: a tile is a coordinate rounded off, and
		// this service stays incapable of saying where its users are.
		h.log.Error("frame fetch failed", "frame", 0, "err", err)
		http.Error(w, "could not reach the radar", http.StatusBadGateway)
		return
	}

	type result struct {
		frame []byte
		err   error
		done  chan struct{}
	}
	results := make([]result, count)
	results[0] = result{frame: whole0, done: closed()}
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
			results[f].frame, results[f].err = h.frames.Frame(r.Context(), base, f)
		}(f)
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Encoding", "gzip")
	gz, _ := gzip.NewWriterLevel(w, 5)
	defer gz.Close()
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

	if !push(field.EncodeTileHeader(field.TileHeader{
		Frames:   uint16(count),
		TileSize: field.TileSize,
		Level:    uint16(level),
		Tiles:    list,
	})) {
		return
	}

	for f := 0; f < count; f++ {
		select {
		case <-results[f].done:
		case <-r.Context().Done():
			return
		}
		if results[f].err != nil {
			if !errors.Is(results[f].err, context.Canceled) {
				h.log.Error("frame fetch failed", "frame", f, "err", results[f].err)
			}
			// Truncated, never skipped: the client counts whole frames from the
			// bytes, so a short run is simply a shorter animation. Cutting here
			// rather than filling a gap keeps that arithmetic true.
			return
		}
		// One flush per FRAME rather than per tile. A frame is the unit the
		// client can do anything with — a half-delivered frame paints part of
		// the screen at one time and part at another — and flushing 40 times
		// inside it would cost deflate block boundaries for nothing.
		buf := make([]byte, 0, len(list)*field.TileSize*field.TileSize)
		for _, t := range list {
			buf = append(buf, field.CutTile(results[f].frame, t, frames.NX, frames.NY, level)...)
		}
		if !push(buf) {
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
		return 0, errors.New("missing")
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

// parseTiles reads `row.col,row.col,…`.
//
// Tile indices rather than cell offsets, so the lattice is the same object on
// both sides and a client cannot invent a tile that straddles two of them —
// which would defeat the entire point, since two clients (or the same client
// after a zoom) would then cache overlapping, non-identical pieces.
func parseTiles(raw string, level int) ([]field.Tile, error) {
	if raw == "" {
		return nil, errors.New("no tiles requested")
	}
	parts := strings.Split(raw, ",")
	if len(parts) > maxTilesPerRequest {
		return nil, errors.New("too many tiles in one request")
	}
	// Duplicates are dropped rather than served twice: a caller repeating a tile
	// would otherwise multiply the response without asking for anything more.
	seen := make(map[field.Tile]bool, len(parts))
	out := make([]field.Tile, 0, len(parts))
	// The lattice shrinks as the level rises: a level-2 tile covers four times
	// the ground per side, so there are a quarter as many rows and columns.
	span := field.TileSize << level
	maxRow := (frames.NY + span - 1) / span
	maxCol := (frames.NX + span - 1) / span
	for _, p := range parts {
		r, c, ok := strings.Cut(p, ".")
		if !ok {
			return nil, errors.New("malformed tile")
		}
		ri, err1 := strconv.Atoi(r)
		ci, err2 := strconv.Atoi(c)
		if err1 != nil || err2 != nil {
			return nil, errors.New("malformed tile")
		}
		// Out of range is dropped, not an error: a map panned into the Atlantic
		// legitimately asks for tiles off the edge of the lattice, and refusing
		// the whole request would make the domain boundary a wall.
		if ri < 0 || ci < 0 || ri >= maxRow || ci >= maxCol {
			continue
		}
		t := field.Tile{Row: int32(ri), Col: int32(ci)}
		if seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	if len(out) == 0 {
		return nil, errors.New("no tiles inside the grid")
	}
	return out, nil
}
