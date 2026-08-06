package handler

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/field"
	"github.com/deviationist/byge/api/internal/limits"
	"github.com/deviationist/byge/api/internal/upstream"
)

// The Nordic grid, mirroring web/lib/grid.ts. Used only to refuse windows that
// fall outside it before they reach MET.
const (
	gridNX = 1694
	gridNY = 2134
)

// field serves a window of the radar grid as one byte per cell.
//
// WHY THIS EXISTS ALONGSIDE /fetch. `/fetch` is a transparent proxy: it hands
// back exactly what MET sent, which is float32, which for one national frame is
// 14 MB uncompressed — MET serves no gzip, verified. That is right for the
// verdict, which reads a 51×51 window and needs the real numbers. It is
// hopeless for a map you pan across a country.
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
	base := q.Get("base")
	if base == "" {
		http.Error(w, "missing base parameter", http.StatusBadRequest)
		return
	}

	row0, err1 := intParam(q.Get("row0"))
	col0, err2 := intParam(q.Get("col0"))
	rows, err3 := intParam(q.Get("rows"))
	cols, err4 := intParam(q.Get("cols"))
	stride, err5 := intParam(q.Get("stride"))
	frames, err6 := intParam(q.Get("frames"))
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil || err6 != nil {
		http.Error(w, "malformed window parameters", http.StatusBadRequest)
		return
	}
	if stride < 1 {
		stride = 1
	}
	if rows < 1 || cols < 1 || frames < 1 {
		http.Error(w, "empty window", http.StatusBadRequest)
		return
	}

	// Clamped rather than rejected: a map panned to the edge of the grid is an
	// ordinary thing to do, and refusing it would make the coastline a wall.
	// The header reports what was actually read, so the client places the cells
	// it got rather than the ones it asked for.
	row0 = clamp(row0, 0, gridNY-1)
	col0 = clamp(col0, 0, gridNX-1)
	rowEnd := clamp(row0+(rows-1)*stride, row0, gridNY-1)
	colEnd := clamp(col0+(cols-1)*stride, col0, gridNX-1)
	rows = (rowEnd-row0)/stride + 1
	cols = (colEnd-col0)/stride + 1

	target := fmt.Sprintf(
		"%s.dods?lwe_precipitation_rate[0:1:%d][%d:%d:%d][%d:%d:%d]",
		base, frames-1, row0, stride, rowEnd, col0, stride, colEnd,
	)

	// The same cap the transparent route enforces. This endpoint is not a way
	// around it — it shrinks what comes BACK, not what MET is asked to do.
	if err := limits.Check(target, h.opts.MaxValues); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	entry, hit, err := h.cache.Do(target, func() (cache.Entry, error) {
		return h.client.Fetch(r.Context(), target)
	})
	if err != nil {
		var forbidden *upstream.ErrForbidden
		if errors.As(err, &forbidden) {
			http.Error(w, "upstream not allowed", http.StatusForbidden)
			return
		}
		if errors.Is(err, context.Canceled) {
			return
		}
		// The window is NOT logged, for the same reason the coordinate is not
		// on /fetch: grid indices are a coordinate in another spelling.
		h.log.Error("upstream fetch failed", "err", err)
		http.Error(w, "upstream fetch failed", http.StatusBadGateway)
		return
	}
	if entry.Status != http.StatusOK {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}

	want := frames * rows * cols
	values, err := field.ParseDods(entry.Body, want)
	if err != nil {
		h.log.Error("field decode failed", "err", err)
		http.Error(w, "could not decode the radar field", http.StatusBadGateway)
		return
	}

	payload, err := field.Encode(field.Header{
		Frames: uint16(frames),
		Width:  uint16(cols),
		Height: uint16(rows),
		Row0:   int32(row0),
		Col0:   int32(col0),
		Stride: uint16(stride),
	}, values)
	if err != nil {
		h.log.Error("field encode failed", "err", err)
		http.Error(w, "could not encode the radar field", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Encoding", "gzip")
	if h.opts.ExposeCacheHeader {
		if hit {
			w.Header().Set("X-Cache", "HIT")
		} else {
			w.Header().Set("X-Cache", "MISS")
		}
	}
	// Compressed here rather than by a middleware, because the ratio is the
	// entire point of the endpoint and it should not depend on whatever sits in
	// front of it in production.
	gz, _ := gzip.NewWriterLevel(w, gzip.BestCompression)
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
