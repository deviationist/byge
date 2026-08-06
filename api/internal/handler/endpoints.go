package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/frames"
)

// The closed API: the client sends PARAMETERS, never a URL.
//
// This service began as `/fetch?url=<anything on an allowlist>`, and that shape
// was wrong in a way an allowlist only papers over. A caller that can name an
// upstream is a caller whose requests we have to police; the allowlist existed
// solely to answer "is this one of ours", and every new capability meant another
// entry and another chance to widen it by accident. It also meant the client had
// to know how MET names its files, so the same knowledge lived on both sides and
// could drift.
//
// Now the proxy owns the upstream entirely. There is no URL parameter anywhere,
// nothing to allowlist, and no request a client can phrase that reaches
// somewhere we did not choose. What is left is four verbs that describe what the
// app actually needs:
//
//	/analysis   which radar run is current
//	/slab       a window of raw values, for a verdict
//	/field      a window of quantised cells, for the map
//	/geocode    a place name for a coordinate
//
// The security properties this buys are not subtle: no SSRF surface, no open
// relay, no way to make MET's rate limits our problem under our own User-Agent.
// Those were all previously held off by one prefix check.

/** Stamps are fixed-width and fully determined; anything else is not one. */
var stampRe = regexp.MustCompile(`^\d{8}T\d{6}Z$`) // stampLayout, exactly

// analysis reports the newest published radar run.
//
// The client used to discover this itself by probing `.dds` files backwards
// through five-minute marks — which worked, but meant it had to know the naming
// scheme, and duplicated the walk the warmer already does. One answer, one
// implementation.
func (h *Handler) analysis(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	if !h.authorised(r) {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}
	if !h.limiter.Allow(h.clientIP(r)) {
		http.Error(w, "slow down", http.StatusTooManyRequests)
		return
	}

	base, err := h.LatestAnalysis(r.Context())
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		h.log.Error("analysis lookup failed", "err", err)
		http.Error(w, "no analysis available", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	// Short: a new run lands every five minutes and the whole point of this
	// endpoint is being current. The 404s behind it are what the cache absorbs.
	w.Header().Set("Cache-Control", "public, max-age=30")
	_ = json.NewEncoder(w).Encode(map[string]string{"stamp": stampOf(base)})
}

// slab returns a raw window of the grid, in OPeNDAP's ASCII form.
//
// This is what a verdict reads: real float values for a small disc, because a
// sentence needs numbers rather than bands. The map's `/field` is the same data
// quantised — two endpoints because they are two different questions, not
// because one is a worse version of the other.
func (h *Handler) slab(w http.ResponseWriter, r *http.Request) {
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
	row0, e1 := intParam(q.Get("row0"))
	col0, e2 := intParam(q.Get("col0"))
	rows, e3 := intParam(q.Get("rows"))
	cols, e4 := intParam(q.Get("cols"))
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil {
		http.Error(w, "malformed window parameters", http.StatusBadRequest)
		return
	}
	win := frames.Window{Row0: row0, Col0: col0, Rows: rows, Cols: cols}.Clamp()

	// A verdict window is small by nature — the widest radius the app offers is
	// 25 km, so 51×51. This is not a general slicing service.
	if win.Rows > maxSlabSide || win.Cols > maxSlabSide {
		http.Error(w, "window too large", http.StatusBadRequest)
		return
	}

	target := fmt.Sprintf(
		"%s.ascii?lwe_precipitation_rate[0:1:%d][%d:1:%d][%d:1:%d]",
		DatasetBase(stamp), frames.NFrames-1,
		win.Row0, win.Row0+win.Rows-1, win.Col0, win.Col0+win.Cols-1,
	)

	entry, hit, err := h.cache.Do(target, func() (cache.Entry, error) {
		return h.client.Fetch(r.Context(), target)
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		// The window is NOT logged: grid indices are a coordinate in another
		// spelling, and this service stays incapable of telling anyone where its
		// users live.
		h.log.Error("slab fetch failed", "err", err)
		http.Error(w, "upstream fetch failed", http.StatusBadGateway)
		return
	}
	if entry.Status != http.StatusOK {
		// A 404 here means the run has not published, which the client handles
		// by asking /analysis again — so it is passed through rather than
		// flattened into a 502.
		http.Error(w, "analysis not available", entry.Status)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(entry.Body)))
	h.markCache(w, hit)
	_, _ = w.Write(entry.Body)
}

// geocode names the coordinate under a saved place.
//
// Proxied for the reasons in lib/geocode.ts: Nominatim's policy wants a
// User-Agent identifying the application, which is a forbidden header in fetch,
// and asks for aggressive caching, which a fixed coordinate makes trivially
// correct. The client sends two numbers; it cannot reach anything else.
func (h *Handler) geocode(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	if !h.authorised(r) {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}
	if !h.limiter.Allow(h.clientIP(r)) {
		http.Error(w, "slow down", http.StatusTooManyRequests)
		return
	}

	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lon, err2 := strconv.ParseFloat(r.URL.Query().Get("lon"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		http.Error(w, "malformed coordinate", http.StatusBadRequest)
		return
	}

	target := nominatimReverse(lat, lon)

	entry, hit, err := h.cache.Do(target, func() (cache.Entry, error) {
		return h.client.Fetch(r.Context(), target)
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		h.log.Error("geocode fetch failed", "err", err)
		http.Error(w, "geocode failed", http.StatusBadGateway)
		return
	}
	if entry.Status != http.StatusOK {
		http.Error(w, "geocode unavailable", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	h.markCache(w, hit)
	_, _ = w.Write(entry.Body)
}

/**
 * The reverse-geocode URL, built entirely from two numbers.
 *
 * zoom=14 is neighbourhood scale, and it is pinned HERE rather than accepted
 * from the client. 16+ starts returning buildings and house numbers, so a
 * client-supplied zoom would let anyone turn byge's context line into an
 * address lookup for a coordinate — precisely the data the app promises never
 * to hold. It was a client parameter until the API was closed; a function so it
 * can be asserted on without a network.
 *
 * The coordinate is rounded to four decimals (~11 m). Enough to name a
 * neighbourhood, coarse enough that the cache key cannot single out a doorstep,
 * and it makes repeats from the same pin collide into one upstream call.
 */
func nominatimReverse(lat, lon float64) string {
	return fmt.Sprintf(
		"https://nominatim.openstreetmap.org/reverse?lat=%s&lon=%s&format=jsonv2&zoom=14&addressdetails=1",
		url.QueryEscape(strconv.FormatFloat(lat, 'f', 4, 64)),
		url.QueryEscape(strconv.FormatFloat(lon, 'f', 4, 64)),
	)
}

/** The widest verdict window the app can ask for: 2×25+1. */
const maxSlabSide = 51

func (h *Handler) markCache(w http.ResponseWriter, hit bool) {
	if !h.opts.ExposeCacheHeader {
		return
	}
	if hit {
		w.Header().Set("X-Cache", "HIT")
	} else {
		w.Header().Set("X-Cache", "MISS")
	}
}

/**
 * The stamp out of a dataset base built by DatasetBase.
 *
 * Positional rather than a regex because the shape is ours: the base always
 * ends `<16-char stamp>.nc`. If that ever stops being true this returns
 * nonsense, which is why the round trip is asserted in the tests.
 */
func stampOf(base string) string {
	base = strings.TrimSuffix(base, ".nc")
	if len(base) < len(stampLayout) {
		return ""
	}
	return base[len(base)-len(stampLayout):]
}
