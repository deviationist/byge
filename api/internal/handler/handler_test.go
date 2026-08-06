package handler

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/upstream"
)

func newTestHandler() *Handler {
	c := cache.New(time.Hour, 30*time.Second, 1<<20)
	u := upstream.New(&http.Client{Timeout: 5 * time.Second}, "byge-test/1.0 test@example.com")
	return New(c, u, []string{"https://byge.ichiva.no"}, slog.New(slog.DiscardHandler))
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
