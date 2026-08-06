// Package upstream fetches from MET, with the allowlist that stops this being
// an open proxy.
package upstream

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/deviationist/byge/api/internal/cache"
)

// Allowed is the complete set of upstream prefixes this service will forward
// to. An allowlist rather than a pattern, because a proxy that will fetch
// arbitrary URLs is an open relay someone else will find and use — and it would
// be doing so under our identifying User-Agent, making MET's rate limits our
// problem and our reputation the collateral.
var Allowed = []string{
	// The gridded radar nowcast. This is the source product the yr tiles are
	// rendered from — continuous mm/h plus _FillValue for "no radar here" —
	// and it is the only place the disc model can come from at full precision.
	"https://thredds.met.no/thredds/dodsC/radarnowcasting/",
	// The point nowcast. Already CORS-enabled and reachable from a browser,
	// but routed through here too so every MET request carries the same
	// identifying agent and benefits from the same cache.
	"https://api.met.no/weatherapi/nowcast/",
}

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
