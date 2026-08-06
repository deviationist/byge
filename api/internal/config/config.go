// Package config loads configuration from the environment. Env is supplied by
// the launcher — Docker Compose via env_file, or the Makefile for a bare
// `go run` — so nothing is read from a .env file in-process.
package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/deviationist/byge/api/internal/limits"
)

type Config struct {
	// Addr is the host:port the HTTP server listens on.
	Addr string

	// UserAgent identifies this application to MET, with contact details.
	// MET's terms require it, and it is the reason this service has to exist
	// at all rather than the browser calling THREDDS directly: `User-Agent`
	// is a forbidden header in the Fetch API, so a browser physically cannot
	// send one. Required — an unidentified client is a terms violation, not a
	// cosmetic omission.
	UserAgent string

	// AllowedOrigins is the CORS allowlist for the web app. Empty means echo
	// nothing, which blocks every browser client — safe by default rather
	// than accidentally open.
	AllowedOrigins []string

	// CacheTTLOK is how long a successful response is kept.
	//
	// Long, deliberately — and NOT the five-minute publish interval. Every
	// analysis URL carries its own timestamp
	// (…nordiclcc-1000.20260806T102000Z.nc), so a 200 is immutable: those
	// bytes never change again. A new analysis is a new key, never a changed
	// one, so there is nothing to invalidate and a short TTL would only mean
	// re-fetching identical data.
	CacheTTLOK time.Duration

	// CacheTTLMiss is how long a 404 is kept, and it is the only knob that
	// controls how quickly a newly published analysis is noticed.
	//
	// The client finds the latest analysis by probing timestamps backwards
	// until one is not a 404, so a 404 means "not published yet" and will flip
	// to 200 within minutes. Caching that answer for the full publish interval
	// would leave us blind to a fresh frame for up to five minutes; not
	// caching it at all sends every client's probe to MET. Short, so probes
	// collapse into roughly one per window.
	CacheTTLMiss time.Duration

	// CacheMaxBytes caps total cached body size. OPeNDAP subsets are small,
	// but the cache is keyed by coordinate and an unbounded map is how a
	// stateless service quietly becomes a memory leak.
	CacheMaxBytes int64

	// UpstreamTimeout bounds a single fetch from MET.
	UpstreamTimeout time.Duration

	// ClientKey, when set, must arrive as X-Byge-Key. Deterrence rather than
	// authentication — it is extractable from a static bundle, and we know it.
	// What it buys is that stumbling across the API is not the same as being
	// able to use it. Empty disables the check, which is what local dev wants.
	ClientKey string

	// RatePerMinute and RateBurst bound volume per client IP. This is the
	// protection that actually holds, since the key is not scarce.
	RatePerMinute int
	RateBurst     int

	// MaxValues caps one request's hyperslab. See internal/limits.
	MaxValues int

	// MaxInflight caps concurrent upstream fetches, so no client can open a
	// hundred simultaneous connections to MET through us.
	MaxInflight int

	// TrustProxyHeaders reads the client IP from X-Real-Ip instead of the
	// socket. True behind nginx; false direct, where the header is spoofable
	// and would let anyone forge a fresh identity per request.
	TrustProxyHeaders bool

	// Env is "production" (default) or "development". Development exposes the
	// X-Cache header, which is useful for debugging and tells a prober exactly
	// how to probe.
	Env string
}

func Load() (Config, error) {
	cfg := Config{
		Addr:            getenv("ADDR", "localhost:8080"),
		UserAgent:       os.Getenv("USER_AGENT"),
		AllowedOrigins:  splitList(os.Getenv("ALLOWED_ORIGINS")),
		CacheTTLOK:      getdur("CACHE_TTL_OK", time.Hour),
		CacheTTLMiss:    getdur("CACHE_TTL_MISS", 30*time.Second),
		CacheMaxBytes:   getint("CACHE_MAX_BYTES", 64<<20),
		UpstreamTimeout: getdur("UPSTREAM_TIMEOUT", 20*time.Second),

		ClientKey:         os.Getenv("CLIENT_KEY"),
		RatePerMinute:     int(getint("RATE_PER_MINUTE", 60)),
		RateBurst:         int(getint("RATE_BURST", 120)),
		MaxValues:         int(getint("MAX_VALUES", int64(limits.DefaultMaxValues))),
		MaxInflight:       int(getint("MAX_INFLIGHT", 8)),
		TrustProxyHeaders: os.Getenv("TRUST_PROXY_HEADERS") == "true",
		Env:               getenv("APP_ENV", "production"),
	}
	if cfg.Env != "production" && cfg.Env != "development" {
		return cfg, errors.New("APP_ENV must be production or development")
	}
	if strings.TrimSpace(cfg.UserAgent) == "" {
		return cfg, errors.New("USER_AGENT is required — MET's terms need an identifying agent with contact details (see .env.example)")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getdur(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getint(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}

func splitList(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
