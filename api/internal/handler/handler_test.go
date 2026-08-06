package handler

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/limits"
	"github.com/deviationist/byge/api/internal/ratelimit"
	"github.com/deviationist/byge/api/internal/upstream"
)

func newTestHandler(opts ...func(*Options)) *Handler {
	c := cache.New(time.Hour, 30*time.Second, 1<<20)
	u := upstream.New(&http.Client{Timeout: 5 * time.Second}, "byge-test/1.0 test@example.com", 8)
	o := Options{
		AllowedOrigins: []string{"https://byge.ichiva.no"},
		MaxValues:      limits.DefaultMaxValues,
	}
	for _, f := range opts {
		f(&o)
	}
	rl := ratelimit.New(6000, 6000) // effectively off unless a test asks for it
	return New(c, u, rl, o, slog.New(slog.DiscardHandler))
}

func get(t *testing.T, h *Handler, target, origin string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/fetch?url="+target, nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	return rec
}

func TestRejectsUrlsOutsideTheAllowlist(t *testing.T) {
	// The allowlist is what stops this being an open relay. Anything it
	// forwarded would go out under our identifying User-Agent, making someone
	// else's traffic MET's problem with our name on it.
	for _, target := range []string{
		"https://example.com/",
		"http://169.254.169.254/latest/meta-data/",
		"https://thredds.met.no.evil.example/thredds/dodsC/radarnowcasting/x",
		"https://api.met.no/weatherapi/locationforecast/2.0/compact",
		// Nominatim is allowlisted only at /reverse. Its search and lookup
		// endpoints are the ones their policy singles out as expensive, and we
		// have no use for either — so the prefix stops at the one we need.
		"https://nominatim.openstreetmap.org/search?q=oslo",
		"https://nominatim.openstreetmap.org/",
	} {
		rec := get(t, newTestHandler(), target, "")
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s → %d, want 403", target, rec.Code)
		}
	}
}

func TestDoesNotEchoTheRejectedUrl(t *testing.T) {
	// Echoing it back would turn the error into a convenient probe for what the
	// allowlist contains.
	rec := get(t, newTestHandler(), "https://example.com/secret-path", "")
	if body, _ := io.ReadAll(rec.Body); string(body) != "upstream not allowed\n" {
		t.Fatalf("body %q leaks the rejected target", string(body))
	}
}

func TestRequiresAUrlParameter(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/fetch", nil)
	rec := httptest.NewRecorder()
	newTestHandler().Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestEchoesOnlyAllowlistedOrigins(t *testing.T) {
	h := newTestHandler()

	rec := get(t, h, "https://example.com/", "https://byge.ichiva.no")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://byge.ichiva.no" {
		t.Errorf("allowed origin not echoed, got %q", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary: Origin missing (got %q) — caches would serve one origin's CORS to another", got)
	}

	rec = get(t, h, "https://example.com/", "https://evil.example")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unlisted origin echoed as %q — the allowlist is the only origin policy", got)
	}
}

func TestPreflightIsAnswered(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/fetch", nil)
	req.Header.Set("Origin", "https://byge.ichiva.no")
	rec := httptest.NewRecorder()
	newTestHandler().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight → %d, want 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatal("preflight did not allow the origin, so no real request can follow")
	}
}

func TestHealthReportsCacheState(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	newTestHandler().Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	for _, want := range []string{`"ok":true`, `"cacheEntries"`, `"cacheBytes"`} {
		if !contains(string(body), want) {
			t.Errorf("health body %s missing %s", body, want)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

func TestRejectsRequestsWithoutTheClientKey(t *testing.T) {
	// Deterrence, not authentication — the key is extractable from the client
	// bundle and we know it. What it buys is that stumbling across the API is
	// not the same as being able to use it.
	h := newTestHandler(func(o *Options) { o.ClientKey = "s3cret" })

	rec := get(t, h, "https://example.com/", "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no key → %d, want 401", rec.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/fetch?url=https://example.com/", nil)
	req.Header.Set(KeyHeader, "wrong")
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong key → %d, want 401", rec.Code)
	}
}

func TestKeyIsCheckedBeforeAnythingElse(t *testing.T) {
	// An unauthorised caller must not be able to learn what the allowlist
	// contains by comparing 403 against 401.
	h := newTestHandler(func(o *Options) { o.ClientKey = "s3cret" })
	rec := get(t, h, "https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.dds", "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("allowlisted URL without a key → %d, want 401", rec.Code)
	}
}

func TestNoKeyConfiguredMeansNoCheck(t *testing.T) {
	// Local dev runs without one; requiring a key by default would make `make
	// dev-api` fail in a way that looks like a bug.
	rec := get(t, newTestHandler(), "https://example.com/", "")
	if rec.Code == http.StatusUnauthorized {
		t.Fatal("401 with no key configured")
	}
}

func TestRejectsOversizedHyperslabs(t *testing.T) {
	// The whole-grid request: allowlisted host, legal OPeNDAP, 347 MB, and it
	// makes MET decompress every time-slice. No rate limit catches it because
	// it is one request.
	h := newTestHandler()
	u := "https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.ascii?" +
		"lwe_precipitation_rate%5B0:1:23%5D%5B0:1:2133%5D%5B0:1:1693%5D"
	rec := get(t, h, u, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("whole-grid request → %d, want 400", rec.Code)
	}
}

func TestRateLimitReturns429WithRetryAfter(t *testing.T) {
	h := newTestHandler()
	h.limiter = ratelimit.New(60, 2)
	for range 2 {
		get(t, h, "https://example.com/", "")
	}
	rec := get(t, h, "https://example.com/", "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("over the limit → %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 without Retry-After leaves a client guessing when to return")
	}
}

func TestClientIPIgnoresSpoofedHeaderWhenNotBehindAProxy(t *testing.T) {
	// Trusting X-Real-Ip unconditionally would let any caller forge a fresh
	// identity per request and walk straight through the limiter.
	h := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/fetch", nil)
	req.RemoteAddr = "203.0.113.5:1234"
	req.Header.Set("X-Real-Ip", "198.51.100.9")
	if got := h.clientIP(req); got != "203.0.113.5" {
		t.Fatalf("clientIP = %q, want the socket address — the header is spoofable", got)
	}

	h2 := newTestHandler(func(o *Options) { o.TrustProxyHeaders = true })
	if got := h2.clientIP(req); got != "198.51.100.9" {
		t.Fatalf("behind a proxy, clientIP = %q, want the forwarded address", got)
	}
}

func TestCacheHeaderIsHiddenInProduction(t *testing.T) {
	// Useful for debugging; also tells a prober exactly how to probe.
	prod := newTestHandler()
	rec := get(t, prod, "https://example.com/", "")
	if rec.Header().Get("X-Cache") != "" {
		t.Error("X-Cache exposed in production")
	}

	dev := newTestHandler(func(o *Options) { o.ExposeCacheHeader = true })
	req := httptest.NewRequest(http.MethodOptions, "/fetch", nil)
	req.Header.Set("Origin", "https://byge.ichiva.no")
	rec = httptest.NewRecorder()
	dev.Routes().ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Expose-Headers") == "" {
		t.Error("dev must expose X-Cache to the browser, or it is unreadable there")
	}
}

func TestPreflightAllowsTheKeyHeader(t *testing.T) {
	// Without this the browser refuses to send X-Byge-Key at all and every real
	// request fails before it is made.
	req := httptest.NewRequest(http.MethodOptions, "/fetch", nil)
	req.Header.Set("Origin", "https://byge.ichiva.no")
	rec := httptest.NewRecorder()
	newTestHandler().Routes().ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != KeyHeader {
		t.Fatalf("Allow-Headers = %q, want %q", got, KeyHeader)
	}
}

func TestOpendapIsStillCapped(t *testing.T) {
	// The other half: exempting one upstream must not exempt the one the cap
	// exists for. A bracket-less thredds query is a whole-grid read.
	rec := get(t, newTestHandler(),
		"https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.ascii?lwe_precipitation_rate", "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("unbounded thredds read → %d, want 400", rec.Code)
	}
}
