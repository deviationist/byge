// Package handler wires the HTTP surface. There are two routes: a proxy and a
// health check. That is the whole API — this service holds no state and owns no
// domain logic, because all of byge's reasoning about rain lives in the client
// where it can be tested without a network.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strconv"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/upstream"
)

type Handler struct {
	cache          *cache.Cache
	client         *upstream.Client
	allowedOrigins []string
	log            *slog.Logger
}

func New(c *cache.Cache, u *upstream.Client, origins []string, log *slog.Logger) *Handler {
	return &Handler{cache: c, client: u, allowedOrigins: origins, log: log}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /fetch", h.fetch)
	mux.HandleFunc("OPTIONS /fetch", h.preflight)
	return mux
}

// cors echoes the requesting origin when it is on the allowlist. Echoing rather
// than wildcarding keeps the door open to credentialed requests later without a
// rewrite, and makes the allowlist the single place origin policy lives.
func (h *Handler) cors(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" || !slices.Contains(h.allowedOrigins, origin) {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
}

func (h *Handler) preflight(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)
	entries, bytes := h.cache.Stats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":           true,
		"cacheEntries": entries,
		"cacheBytes":   bytes,
	})
}

// fetch proxies one allowlisted upstream URL.
//
// The target arrives as a `url` query parameter rather than as a path prefix so
// that OPeNDAP's own syntax — which is full of brackets, commas and colons —
// survives the trip without a rewriting layer that would need to understand it.
func (h *Handler) fetch(w http.ResponseWriter, r *http.Request) {
	h.cors(w, r)

	target := r.URL.Query().Get("url")
	if target == "" {
		http.Error(w, "missing url parameter", http.StatusBadRequest)
		return
	}
	if _, err := url.Parse(target); err != nil {
		http.Error(w, "malformed url parameter", http.StatusBadRequest)
		return
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
	if hit {
		w.Header().Set("X-Cache", "HIT")
	} else {
		w.Header().Set("X-Cache", "MISS")
	}
	w.WriteHeader(entry.Status)
	_, _ = w.Write(entry.Body)
}
