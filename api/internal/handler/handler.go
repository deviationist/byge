// Package handler wires the HTTP surface. There are two routes: a proxy and a
// health check. That is the whole API — this service holds no state and owns no
// domain logic, because all of byge's reasoning about rain lives in the client
// where it can be tested without a network.
package handler

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strconv"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/frames"
	"github.com/deviationist/byge/api/internal/limits"
	"github.com/deviationist/byge/api/internal/ratelimit"
	"github.com/deviationist/byge/api/internal/upstream"
)

// KeyHeader carries the shared client key. Named rather than Authorization
// because it is not authentication — nothing is being authenticated, and
// calling it Bearer would overstate what it does.
const KeyHeader = "X-Byge-Key"

type Options struct {
	AllowedOrigins    []string
	ClientKey         string
	MaxValues         int
	TrustProxyHeaders bool
	// ExposeCacheHeader adds X-Cache. On in development, where it answers "is
	// the cache working?"; off in production, where it answers the same question
	// for somebody probing us.
	ExposeCacheHeader bool
}

type Handler struct {
	frames  *frames.Store
	cache   *cache.Cache
	client  *upstream.Client
	limiter *ratelimit.Limiter
	opts    Options
	log     *slog.Logger
}

func New(c *cache.Cache, u *upstream.Client, l *ratelimit.Limiter, opts Options, log *slog.Logger) *Handler {
	h := &Handler{cache: c, client: u, limiter: l, opts: opts, log: log}
	// Whole frames, fetched through the same allowlisted client and the same
	// coalescing cache as everything else.
	h.frames = frames.New(h.fetchWholeFrame)
	return h
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /fetch", h.fetch)
	mux.HandleFunc("OPTIONS /fetch", h.preflight)
	mux.HandleFunc("GET /field", h.field)
	mux.HandleFunc("OPTIONS /field", h.preflight)
	return mux
}

// clientIP identifies the caller for rate limiting.
//
// X-Real-Ip is only trusted when we are told we sit behind a proxy that sets
// it. Trusting it unconditionally would let any caller forge a fresh identity
// per request and walk straight through the limiter.
func (h *Handler) clientIP(r *http.Request) string {
	if h.opts.TrustProxyHeaders {
		if v := r.Header.Get("X-Real-Ip"); v != "" {
			return v
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// cors echoes the requesting origin when it is on the allowlist. Echoing rather
// than wildcarding keeps the door open to credentialed requests later without a
// rewrite, and makes the allowlist the single place origin policy lives.
func (h *Handler) cors(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" || !slices.Contains(h.opts.AllowedOrigins, origin) {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	if h.opts.ExposeCacheHeader {
		w.Header().Set("Access-Control-Expose-Headers", "X-Cache")
	}
}

func (h *Handler) preflight(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	// Without this the browser refuses to send the key header at all, and every
	// real request fails before it is made.
	w.Header().Set("Access-Control-Allow-Headers", KeyHeader)
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.WriteHeader(http.StatusNoContent)
}

// authorised checks the shared key when one is configured.
func (h *Handler) authorised(r *http.Request) bool {
	if h.opts.ClientKey == "" {
		return true
	}
	got := r.Header.Get(KeyHeader)
	// Constant-time, so the check cannot be turned into an oracle. The key is
	// weak by design; that is no reason to also leak it a byte at a time.
	return subtle.ConstantTimeCompare([]byte(got), []byte(h.opts.ClientKey)) == 1
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	entries, bytes := h.cache.Stats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":           true,
		"cacheEntries": entries,
		"cacheBytes":   bytes,
		"clients":      h.limiter.Len(),
	})
}

// fetch proxies one allowlisted upstream URL.
//
// The target arrives as a `url` query parameter rather than as a path prefix so
// that OPeNDAP's own syntax — which is full of brackets, commas and colons —
// survives the trip without a rewriting layer that would need to understand it.
func (h *Handler) fetch(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)

	if !h.authorised(r) {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}
	if !h.limiter.Allow(h.clientIP(r)) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}

	target := r.URL.Query().Get("url")
	if target == "" {
		http.Error(w, "missing url parameter", http.StatusBadRequest)
		return
	}
	if _, err := url.Parse(target); err != nil {
		http.Error(w, "malformed url parameter", http.StatusBadRequest)
		return
	}
	// Allowlist first, so a rejected host never reaches the parser. The
	// alternative order answers an off-allowlist URL with a complaint about its
	// query string — the wrong reason, and a hint about what we parse. Both run
	// before anything is forwarded.
	if !upstream.Permitted(target) {
		http.Error(w, "upstream not allowed", http.StatusForbidden)
		return
	}
	// The magnitude cap is OPeNDAP-specific: it refuses a constraint expression
	// with no index brackets, because against thredds that means the whole grid.
	// Against the geocoder `?lat=&lon=` has no brackets and is simply a request,
	// so an uncapped source has to be exempt or it could never be called.
	if upstream.Capped(target) {
		if err := limits.Check(target, h.opts.MaxValues); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	entry, hit, err := h.cache.Do(target, func() (cache.Entry, error) {
		return h.client.Fetch(r.Context(), target)
	})
	if err != nil {
		var forbidden *upstream.ErrForbidden
		if errors.As(err, &forbidden) {
			// Deliberately not echoing the URL back: it would make this a
			// convenient probe for what the allowlist contains.
			http.Error(w, "upstream not allowed", http.StatusForbidden)
			return
		}
		if errors.Is(err, context.Canceled) {
			return
		}
		// The coordinate is NOT logged. This service is stateless and stays
		// that way — an access log full of home coordinates is a database
		// nobody decided to build.
		h.log.Error("upstream fetch failed", "err", err)
		http.Error(w, "upstream fetch failed", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", entry.ContentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(entry.Body)))
	if h.opts.ExposeCacheHeader {
		if hit {
			w.Header().Set("X-Cache", "HIT")
		} else {
			w.Header().Set("X-Cache", "MISS")
		}
	}
	w.WriteHeader(entry.Status)
	_, _ = w.Write(entry.Body)
}

// Frames exposes the store so the warmer can fill it. The handler owns it
// because it owns the fetch path — the allowlisted client, the coalescing
// cache — and a second way in would be a second set of rules.
func (h *Handler) Frames() *frames.Store { return h.frames }
