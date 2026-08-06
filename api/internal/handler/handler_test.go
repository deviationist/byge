package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/ratelimit"
	"github.com/deviationist/byge/api/internal/upstream"
)

/**
 * The API is CLOSED: every endpoint takes parameters, and none takes a URL.
 *
 * These tests used to be about an allowlist — whether a caller could name an
 * upstream we had not chosen. That question no longer exists, because a caller
 * cannot name an upstream at all. What replaces it is narrower and sharper: the
 * few values that DO reach a URL by concatenation must be provably incapable of
 * changing which host we talk to.
 */

func newTestHandler(opts ...func(*Options)) *Handler {
	c := cache.New(time.Hour, 30*time.Second, 1<<20)
	u := upstream.New(&http.Client{Timeout: 5 * time.Second}, "byge-test/1.0 test@example.com", 8)
	o := Options{
		AllowedOrigins: []string{"https://byge.ichiva.no"},
	}
	for _, f := range opts {
		f(&o)
	}
	rl := ratelimit.New(6000, 6000) // effectively off unless a test asks for it
	return New(c, u, rl, o, slog.New(slog.DiscardHandler))
}

func call(t *testing.T, h *Handler, path, origin string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	return rec
}

/** Every endpoint, so a new one cannot quietly skip the shared guards. */
var endpoints = []string{
	"/analysis",
	"/slab?stamp=20260806T120000Z&row0=1400&col0=500&rows=7&cols=7",
	"/tiles?stamp=20260806T120000Z&frames=1&tiles=11.4",
	"/geocode?lat=59.9273&lon=10.7607",
}

func TestNoEndpointAcceptsAUrl(t *testing.T) {
	// The property this refactor exists for. `/fetch?url=` is gone, and with it
	// the SSRF surface an allowlist was holding shut. A caller cannot phrase a
	// request that reaches somewhere we did not choose.
	rec := call(t, newTestHandler(), "/fetch?url=https://example.com/", "")
	if rec.Code != http.StatusNotFound {
		t.Errorf("/fetch still answers with %d — the URL surface is not closed", rec.Code)
	}
}

func TestStampCannotRedirectTheUpstream(t *testing.T) {
	// The stamp is concatenated into the dataset URL, so it is the one value a
	// caller controls that touches a hostname. Unvalidated, a traversal or a
	// scheme could point the fetch anywhere — the hole removing /fetch was
	// meant to close, reopened by a string join.
	hostile := []string{
		"../../../../etc/passwd",
		"..%2f..%2fevil",
		"20260806T120000Z/../../evil",
		"https://evil.example/x",
		"20260806T120000Z?x=y",
		"20260806T12000Z", // one digit short
		"",
	}
	for _, s := range hostile {
		for _, ep := range []string{"/slab?stamp=", "/tiles?tiles=11.4&stamp="} {
			rec := call(t, newTestHandler(), ep+s+"&row0=0&col0=0&rows=2&cols=2&frames=1", "")
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s%q → %d, want 400", ep, s, rec.Code)
			}
		}
	}
}

func TestRejectsRequestsWithoutTheClientKey(t *testing.T) {
	h := newTestHandler(func(o *Options) { o.ClientKey = "secret" })
	for _, ep := range endpoints {
		if rec := call(t, h, ep, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s without a key → %d, want 401", ep, rec.Code)
		}
	}
}

func TestKeyIsCheckedBeforeAnythingElse(t *testing.T) {
	// An unauthorised caller must not be able to learn what we accept by
	// watching which malformed requests fail differently.
	h := newTestHandler(func(o *Options) { o.ClientKey = "secret" })
	rec := call(t, h, "/slab?stamp=nonsense&rows=99999", "")
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("malformed unauthorised request → %d, want 401", rec.Code)
	}
}

func TestAcceptsTheRightKey(t *testing.T) {
	h := newTestHandler(func(o *Options) { o.ClientKey = "secret" })
	req := httptest.NewRequest(http.MethodGet, "/geocode?lat=1000&lon=0", nil)
	req.Header.Set(KeyHeader, "secret")
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	// 400 for the out-of-range coordinate, which proves it got past the key.
	if rec.Code == http.StatusUnauthorized {
		t.Error("a valid key was rejected")
	}
}

func TestEchoesOnlyAllowlistedOrigins(t *testing.T) {
	h := newTestHandler()
	ok := call(t, h, "/geocode?lat=1000&lon=0", "https://byge.ichiva.no")
	if got := ok.Header().Get("Access-Control-Allow-Origin"); got != "https://byge.ichiva.no" {
		t.Errorf("allowed origin not echoed: %q", got)
	}
	bad := call(t, h, "/geocode?lat=1000&lon=0", "https://evil.example")
	if got := bad.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unlisted origin was echoed: %q", got)
	}
}

func TestPreflightIsAnswered(t *testing.T) {
	h := newTestHandler()
	for _, ep := range []string{"/analysis", "/slab", "/tiles", "/geocode"} {
		req := httptest.NewRequest(http.MethodOptions, ep, nil)
		req.Header.Set("Origin", "https://byge.ichiva.no")
		rec := httptest.NewRecorder()
		h.Routes().ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent && rec.Code != http.StatusOK {
			t.Errorf("OPTIONS %s → %d", ep, rec.Code)
		}
	}
}

func TestRateLimitReturns429(t *testing.T) {
	c := cache.New(time.Hour, 30*time.Second, 1<<20)
	u := upstream.New(&http.Client{Timeout: time.Second}, "byge-test/1.0", 4)
	h := New(c, u, ratelimit.New(1, 1), Options{}, slog.New(slog.DiscardHandler))

	_ = call(t, h, "/geocode?lat=1000&lon=0", "")
	rec := call(t, h, "/geocode?lat=1000&lon=0", "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second request → %d, want 429", rec.Code)
	}
}

func TestRejectsOversizedWindows(t *testing.T) {
	// A verdict window is small by nature. This is not a general slicing
	// service, and it should say so before asking MET for anything.
	h := newTestHandler()
	rec := call(t, h, "/slab?stamp=20260806T120000Z&row0=0&col0=0&rows=900&cols=900", "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("oversized slab → %d, want 400", rec.Code)
	}
}

func TestRejectsMalformedCoordinates(t *testing.T) {
	h := newTestHandler()
	for _, q := range []string{
		"lat=abc&lon=10",
		"lat=91&lon=10",
		"lat=59&lon=200",
		"lon=10",
	} {
		if rec := call(t, h, "/geocode?"+q, ""); rec.Code != http.StatusBadRequest {
			t.Errorf("/geocode?%s → %d, want 400", q, rec.Code)
		}
	}
}

func TestDatasetBaseCarriesTheNcSuffix(t *testing.T) {
	// The `.nc` is part of MET's FILENAME, not an extension OPeNDAP strips, and
	// leaving it off is the quietest possible failure: the URL is well-formed,
	// on the allowlist, and answered with `FileNotFound` for every stamp that
	// has ever been published. Which is indistinguishable from "this run has not
	// landed yet" — so the analysis walk searched all eight steps, found
	// nothing, and reported the radar as unavailable while MET was serving it
	// happily. It cost a debugging session; it costs one assertion to prevent.
	base := DatasetBase("20260806T212500Z")
	if !strings.HasSuffix(base, "20260806T212500Z.nc") {
		t.Fatalf("DatasetBase = %q, want it to end .nc", base)
	}
	if !strings.HasPrefix(base, "https://thredds.met.no/thredds/dodsC/radarnowcasting/") {
		t.Errorf("DatasetBase escaped the dataset directory: %q", base)
	}

	// /analysis answers with a stamp lifted back out of a base, so the two have
	// to agree — a `.nc` added to one and forgotten in the other would hand the
	// client a stamp it cannot use.
	if got := stampOf(base); got != "20260806T212500Z" {
		t.Errorf("stampOf(DatasetBase(s)) = %q, want the stamp back", got)
	}
	if !stampRe.MatchString(stampOf(AnalysisBase(time.Unix(1786080300, 0)))) {
		t.Error("AnalysisBase produced a stamp its own validator rejects")
	}
}

func TestGeocodeZoomIsPinnedServerSide(t *testing.T) {
	// The precision of a reverse lookup is a privacy decision, and it used to be
	// a client-side one. zoom=16 returns house numbers; byge's context line is a
	// neighbourhood. Now that the client sends only a coordinate, this is the
	// only place that choice exists — so it is the only place it can be checked.
	got := nominatimReverse(59.92734, 10.76089)
	if !strings.Contains(got, "zoom=14") {
		t.Errorf("zoom not pinned: %s", got)
	}
	if !strings.Contains(got, "lat=59.9273") || strings.Contains(got, "59.92734") {
		t.Errorf("coordinate not rounded to four decimals: %s", got)
	}
}

func TestTileListIsParsedAndBounded(t *testing.T) {
	ok, err := parseTiles("0.0,11.4,16.13")
	if err != nil {
		t.Fatalf("a valid list was refused: %v", err)
	}
	if len(ok) != 3 {
		t.Errorf("got %d tiles, want 3", len(ok))
	}

	// A tile repeated would otherwise multiply the response without the caller
	// asking for anything more.
	if dup, _ := parseTiles("5.5,5.5,5.5"); len(dup) != 1 {
		t.Errorf("duplicates were not collapsed: %d tiles", len(dup))
	}

	// A map panned into the Atlantic legitimately names tiles off the lattice.
	// Those are dropped, not refused — the domain boundary must not be a wall.
	mixed, err := parseTiles("0.0,9999.9999")
	if err != nil || len(mixed) != 1 {
		t.Errorf("off-lattice tile was not dropped cleanly: %v, %d tiles", err, len(mixed))
	}
	if _, err := parseTiles("9999.9999"); err == nil {
		t.Error("a request entirely outside the grid should be a 400")
	}

	for _, bad := range []string{"", "abc", "1.", "1.2.3", "-1.x"} {
		if _, err := parseTiles(bad); err == nil {
			t.Errorf("parseTiles(%q) was accepted", bad)
		}
	}
}

func TestTilesEndpointRefusesAnUnboundedList(t *testing.T) {
	// The list is the one parameter here that can grow without limit, in the URL
	// and in the response. A caller must not be able to enumerate the whole
	// lattice across every frame in one request.
	var b strings.Builder
	for i := 0; i < maxTilesPerRequest+1; i++ {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%d.%d", i%16, i%13)
	}
	if _, err := parseTiles(b.String()); err == nil {
		t.Error("an oversized tile list was accepted")
	}

	rec := call(t, newTestHandler(), "/tiles?stamp=20260806T120000Z&frames=1&tiles="+b.String(), "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("oversized /tiles → %d, want 400", rec.Code)
	}
}

func TestHealthNeedsNoKey(t *testing.T) {
	// A health check that requires a secret is one the orchestrator cannot run.
	h := newTestHandler(func(o *Options) { o.ClientKey = "secret" })
	if rec := call(t, h, "/health", ""); rec.Code != http.StatusOK {
		t.Errorf("/health → %d, want 200", rec.Code)
	}
}

func TestErrorsNeverEchoTheUpstream(t *testing.T) {
	// Error bodies describe the request, not our plumbing: an upstream URL in a
	// 400 turns the endpoint into a probe for what we talk to.
	h := newTestHandler()
	rec := call(t, h, "/slab?stamp=bogus&row0=0&col0=0&rows=2&cols=2", "")
	body := rec.Body.String()
	if strings.Contains(body, "thredds") || strings.Contains(body, "http") {
		t.Errorf("error body leaks the upstream: %q", body)
	}
}
