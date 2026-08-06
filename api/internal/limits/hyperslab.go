// Package limits bounds how much data a single request may ask MET for.
//
// The allowlist in `upstream` decides WHERE we will fetch; this decides HOW
// MUCH. Without it, an allowlisted URL can still ask for the entire grid —
// `lwe_precipitation_rate[0:1:23][0:1:2133][0:1:1693]` is 86.8 million values,
// ~347 MB, and it is a perfectly legal OPeNDAP request. Worse, the file is
// chunked one full time-slice per chunk, so a request like that makes MET
// decompress the whole variable. One of those does more damage to our standing
// with MET than a thousand people politely reading 7×7 windows, and no
// generous rate limit would catch it because it is a single request.
package limits

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// What actually costs MET, measured rather than assumed.
//
// The file is chunked ONE FULL TIME-SLICE PER CHUNK, so any read of a frame
// decompresses that whole frame regardless of how little of it you asked for.
// Timed against the live service:
//
//	 1 frame,  51×51        11 KB     81 ms
//	 1 frame, 201×201      160 KB     87 ms
//	 1 frame, 501×501      985 KB    144 ms
//	 1 frame, ENTIRE grid   14 MB    542 ms
//	24 frames, 51×51       245 KB    947 ms
//
// Area is nearly free; FRAMES are the cost. A single frame of the entire Nordic
// mosaic is faster than a postage stamp across all 24.
//
// This corrects an earlier assumption. The cap used to bound every dimension's
// SPAN at 51 cells, on the reasoning that a coarse stride reads fewer values
// while still forcing MET to decompress every chunk it touches — so bounding
// the count would let a sampler walk the grid for free. The chunking is real,
// but the conclusion was wrong in one direction: because a frame is ONE chunk,
// walking it costs no more than touching it, and the span cap was refusing wide
// single-frame reads that are cheap while doing nothing the frame cap does not
// already do.
//
// So the two things worth bounding are the two things that actually scale:
//
//	frames  the server's decompression work, and the only axis that grows it
//	values  the bytes on the wire, which area does grow
//
// The abusive request the package exists to refuse is still refused:
// `[0:1:23][0:1:2133][0:1:1693]` is 86.8 million values and fails the value cap
// by two orders of magnitude, strided or not.
const (
	// MaxFrames caps the TIME dimension specifically. This is the expensive
	// axis, and the app never needs more than the product publishes.
	MaxFrames = 24 // NFRAMES in web/lib/grid.ts

	// MaxRadiusKm is the widest radius the app offers, kept because the verdict
	// path still reasons in radii. It no longer caps a dimension on its own.
	//
	// COUPLING: raise MAX_RADIUS_KM in web/lib/storage.ts and the value budget
	// below must still admit 24 × (2r+1)².
	MaxRadiusKm = 25

	// DefaultMaxValues admits every shape the app legitimately asks for and
	// nothing like the whole cube:
	//
	//	verdict, widest radius   24 × 51×51    =  62 424
	//	map, wide single frame    1 × 501×501  = 251 001
	//	map, animated window     24 × 128×128  = 393 216
	//	the whole cube           24 × 2134×1694 = 86 761   (thousand) — refused
	//
	// It bounds transfer, not server work: 400k float32 is about 1.5 MB, which
	// is the most this app has any business pulling in one request.
	DefaultMaxValues = 400_000
)

type Error struct {
	Reason string
}

func (e *Error) Error() string { return e.Reason }

// Check parses the OPeNDAP constraint expression from a URL and rejects
// requests that are unbounded or too large.
//
// Metadata requests (.dds, .das, .html) carry no constraint and are always
// allowed — they are a few KB and describe the file rather than reading it.
func Check(rawURL string, maxValues int) error {
	q := strings.IndexByte(rawURL, '?')
	if q < 0 {
		return nil // metadata: no constraint expression
	}
	expr := rawURL[q+1:]
	if strings.TrimSpace(expr) == "" {
		return nil
	}
	// Decode before parsing. RFC 3986 does not allow bare `[` in a query, so a
	// correct client sends `%5B` — the browser's own encodeURI does this. Parsing
	// the raw form would find no brackets at all and reject a perfectly ordinary
	// window as "unbounded", which is exactly what it did the first time the app
	// talked to a proxy that had this check.
	if decoded, err := url.QueryUnescape(expr); err == nil {
		expr = decoded
	}

	total := 0
	// Multiple variables are comma-separated at the top level. Index ranges use
	// colons, never commas, so a plain split is safe here.
	for _, part := range strings.Split(expr, ",") {
		n, err := countOne(part)
		if err != nil {
			return err
		}
		total += n
		if total > maxValues {
			return &Error{Reason: fmt.Sprintf("request asks for %d+ values, limit is %d", total, maxValues)}
		}
	}
	return nil
}

// countOne returns how many values one variable projection asks for.
func countOne(part string) (int, error) {
	part = strings.TrimSpace(part)
	open := strings.IndexByte(part, '[')
	if open < 0 {
		// A bare variable name means "the whole thing" — which for
		// lwe_precipitation_rate is the entire 86.8-million-value cube. This is
		// the exact shape the cap exists to refuse, so it is never allowed even
		// though it is syntactically valid OPeNDAP.
		return 0, &Error{Reason: "unbounded request: every variable must be indexed"}
	}

	count := 1
	dim := 0
	rest := part[open:]
	for len(rest) > 0 {
		if rest[0] != '[' {
			return 0, &Error{Reason: "malformed constraint expression"}
		}
		close := strings.IndexByte(rest, ']')
		if close < 0 {
			return 0, &Error{Reason: "malformed constraint expression"}
		}
		n, span, err := countDim(rest[1:close])
		if err != nil {
			return 0, err
		}
		// The FIRST dimension is time. That is a property of this variable's
		// shape — `lwe_precipitation_rate[time][Yc][Xc]` — and it is safe to
		// rely on because `upstream.Allowed` admits exactly one gridded
		// dataset. If a second one is ever allowlisted, this assumption has to
		// be revisited with it.
		//
		// Capped by SPAN, not count: striding time still makes MET decompress
		// every frame the range touches, so `[0:5:23]` costs what `[0:1:23]`
		// costs. The spatial dimensions get no span cap, because a frame is a
		// single chunk — walking one costs no more than touching it — and their
		// bytes are bounded by the value budget below.
		if dim == 0 && span > MaxFrames {
			return 0, &Error{Reason: fmt.Sprintf("request spans %d frames, limit is %d", span, MaxFrames)}
		}
		count *= n
		dim++
		rest = rest[close+1:]
	}
	return count, nil
}

// countDim sizes one `[start:stride:end]`, `[start:end]` or `[index]` range,
// returning how many values it yields and how many cells it spans.
func countDim(s string) (count, span int, err error) {
	fields := strings.Split(s, ":")
	nums := make([]int, 0, 3)
	for _, f := range fields {
		v, err := strconv.Atoi(strings.TrimSpace(f))
		if err != nil {
			return 0, 0, &Error{Reason: "non-numeric index in constraint expression"}
		}
		if v < 0 {
			return 0, 0, &Error{Reason: "negative index in constraint expression"}
		}
		nums = append(nums, v)
	}

	var start, stride, end int
	switch len(nums) {
	case 1:
		return 1, 1, nil // a single index
	case 2:
		start, stride, end = nums[0], 1, nums[1]
	case 3:
		start, stride, end = nums[0], nums[1], nums[2]
	default:
		return 0, 0, &Error{Reason: "malformed index range"}
	}
	if stride < 1 {
		return 0, 0, &Error{Reason: "stride must be at least 1"}
	}
	if end < start {
		return 0, 0, &Error{Reason: "index range ends before it starts"}
	}
	return (end-start)/stride + 1, end - start + 1, nil
}
