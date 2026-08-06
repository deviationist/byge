// Package handler wires the HTTP surface: four verbs and a health check, none
// of which takes a URL. That closure is the point — see endpoints.go for why
// `/fetch?url=` was the wrong shape rather than merely a risky one.
//
// The service still owns no domain logic. All of byge's reasoning about rain
// lives in the client where it can be tested without a network; what lives here
// is knowledge of how MET names and slices its files, which is the one thing
// that has no business being duplicated in a browser.
package handler

import (
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"slices"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/frames"
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
	// Four verbs, no URL parameter anywhere. See internal/handler/endpoints.go
	// for why the `/fetch?url=` shape was wrong rather than merely risky.
	mux.HandleFunc("GET /analysis", h.analysis)
	mux.HandleFunc("OPTIONS /analysis", h.preflight)
	mux.HandleFunc("GET /slab", h.slab)
	mux.HandleFunc("OPTIONS /slab", h.preflight)
	mux.HandleFunc("GET /tiles", h.tiles)
	mux.HandleFunc("OPTIONS /tiles", h.preflight)
	mux.HandleFunc("GET /geocode", h.geocode)
	mux.HandleFunc("OPTIONS /geocode", h.preflight)
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

// Frames exposes the store so the warmer can fill it. The handler owns it
// because it owns the fetch path — the allowlisted client, the coalescing
// cache — and a second way in would be a second set of rules.
func (h *Handler) Frames() *frames.Store { return h.frames }
