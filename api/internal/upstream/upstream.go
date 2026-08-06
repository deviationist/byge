// Package upstream fetches from MET with an identifying agent, behind an
// allowlist of the hosts this service is allowed to talk to.
//
// THE ALLOWLIST IS NO LONGER THE SECURITY BOUNDARY — it is a backstop, and the
// demotion is deliberate. It used to be the only thing standing between a
// `/fetch?url=` parameter and an open relay: a caller named the destination and
// this decided whether to go there. Now no caller names anything. Every URL in
// this service is built server-side from validated parameters, so the allowlist
// can no longer be the thing that saves us — by the time a request reaches
// Fetch, the question "did someone else choose this?" has no meaning.
//
// It stays because the failure it now catches is OURS. A bug in a URL builder,
// a stamp that slips past its regex, a future endpoint that forgets to
// validate: any of those produce a request we did not intend, and this refuses
// it rather than sending it under our identifying User-Agent. A second lock on
// a door that is no longer the way in.
package upstream

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/deviationist/byge/api/internal/cache"
)

// Allowed is the complete set of upstream prefixes this service will fetch.
//
// It lists exactly what our own URL builders produce, and nothing wider. There
// used to be a third entry for MET's point nowcast (`api.met.no/weatherapi/`),
// admitted when any client could ask for any allowlisted URL; nothing in the
// service has ever built one, so it was a door left open for a room we do not
// use.
var Allowed = []string{
	// The gridded radar nowcast. This is the source product the yr tiles are
	// rendered from — continuous mm/h plus _FillValue for "no radar here" — and
	// it is the only place the disc model can come from at full precision.
	// Built by handler.AnalysisBase and the /slab and /field endpoints.
	"https://thredds.met.no/thredds/dodsC/radarnowcasting/",
	// Reverse geocoding, for the "Grünerløkka, Oslo" line under a place name.
	//
	// NOT here for CORS — Nominatim allows browser calls. It is here for the two
	// things a browser cannot do. Their usage policy requires a User-Agent that
	// identifies the application, and User-Agent is a forbidden header in fetch,
	// so a direct browser call could not comply even in principle. And the
	// policy asks for aggressive caching, which is trivially correct here: the
	// place name of a fixed coordinate does not change, so a cached hit stays
	// valid and every repeat lookup we serve is one they never see.
	//
	// The prefix stops at /reverse. Their search and lookup endpoints are the
	// ones the policy singles out as expensive, and we have no use for either.
	"https://nominatim.openstreetmap.org/reverse",
}

// Permitted reports whether a target is on the allowlist. Exported for the
// tests, which are the only thing that asks — production code cannot reach
// Fetch with an unbuilt URL, which is the property under test.
func Permitted(raw string) bool { return permitted(raw) }

func permitted(raw string) bool {
	for _, prefix := range Allowed {
		if strings.HasPrefix(raw, prefix) {
			return true
		}
	}
	return false
}

// safeURL percent-encodes square brackets in the query.
//
// OPeNDAP subset syntax is full of them — `lwe_precipitation_rate[0:1:23][…]` —
// but RFC 3986 does not permit a bare `[` or `]` in a request target, and MET's
// Tomcat enforces that strictly: it answers `400 Invalid character found in the
// request target` rather than serving the data. Go passes RawQuery through
// verbatim, so without this the brackets reach the wire as-is.
//
// Encoding them is not a workaround for MET being fussy; it is what the spec
// requires, and `%5B` is understood identically by the OPeNDAP layer behind
// Tomcat.
func safeURL(raw string) string {
	q := strings.IndexByte(raw, '?')
	if q < 0 {
		return raw
	}
	head, query := raw[:q+1], raw[q+1:]
	query = strings.ReplaceAll(query, "[", "%5B")
	query = strings.ReplaceAll(query, "]", "%5D")
	return head + query
}

type Client struct {
	http      *http.Client
	userAgent string
	// sem caps concurrent fetches. One client should not be able to open a
	// hundred simultaneous connections to MET through us — the coalescing in
	// `cache` collapses identical requests, but a hundred DIFFERENT windows
	// would still all go out at once.
	sem chan struct{}
}

func New(hc *http.Client, userAgent string, maxInflight int) *Client {
	if maxInflight < 1 {
		maxInflight = 1
	}
	return &Client{http: hc, userAgent: userAgent, sem: make(chan struct{}, maxInflight)}
}

// ErrForbidden is returned for a URL outside the allowlist.
type ErrForbidden struct{ URL string }

func (e *ErrForbidden) Error() string { return fmt.Sprintf("upstream not allowed: %s", e.URL) }

// Fetch retrieves raw, verbatim. No parsing: OPeNDAP replies are binary, and
// the client already knows how to read them — the whole value this adds is the
// identifying agent, the CORS header, and the cache in front.
func (c *Client) Fetch(ctx context.Context, rawURL string) (cache.Entry, error) {
	if !permitted(rawURL) {
		return cache.Entry{}, &ErrForbidden{URL: rawURL}
	}
	// Wait for a slot, but never past the caller giving up.
	select {
	case c.sem <- struct{}{}:
		defer func() { <-c.sem }()
	case <-ctx.Done():
		return cache.Entry{}, ctx.Err()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, safeURL(rawURL), nil)
	if err != nil {
		return cache.Entry{}, err
	}
	// The reason this service exists. A browser cannot set this — `User-Agent`
	// is a forbidden header name in the Fetch API — so every request from the
	// SPA would otherwise reach MET anonymous, in breach of their terms.
	req.Header.Set("User-Agent", c.userAgent)

	res, err := c.http.Do(req)
	if err != nil {
		return cache.Entry{}, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return cache.Entry{}, err
	}
	ct := res.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	return cache.Entry{Status: res.StatusCode, ContentType: ct, Body: body}, nil
}
