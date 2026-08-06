package upstream

import "testing"

func TestPermittedIsPrefixExact(t *testing.T) {
	// A lookalike host must not pass. `thredds.met.no.evil.example` has our
	// allowlisted string as a prefix of its HOSTNAME, which is precisely the
	// shape a naive `strings.Contains` would wave through.
	//
	// This is a backstop now rather than the boundary — no caller supplies a URL
	// any more — but it is the backstop against OUR mistakes, and a prefix check
	// that is subtly wrong is worse than none because it reads as protection.
	deny := []string{
		"https://thredds.met.no.evil.example/thredds/dodsC/radarnowcasting/x",
		"https://example.com/",
		"http://169.254.169.254/latest/meta-data/",
		// Allowlisted host, endpoint we never use. Their policy names search and
		// lookup as the expensive ones, so the prefix stops at /reverse.
		"https://nominatim.openstreetmap.org/search?q=oslo",
		"https://nominatim.openstreetmap.org/",
		// MET's point nowcast: a real MET endpoint, but nothing here builds one.
		// The allowlist admits what we construct, not what we could imagine.
		"https://api.met.no/weatherapi/nowcast/2.0/complete?lat=59&lon=10",
	}
	for _, u := range deny {
		if Permitted(u) {
			t.Errorf("Permitted(%q) = true, want false", u)
		}
	}

	allow := []string{
		"https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.ascii?v%5B0%5D",
		"https://nominatim.openstreetmap.org/reverse?lat=59.9&lon=10.7&format=jsonv2",
	}
	for _, u := range allow {
		if !Permitted(u) {
			t.Errorf("Permitted(%q) = false, want true", u)
		}
	}
}

func TestSafeURLEncodesOpendapBrackets(t *testing.T) {
	// RFC 3986 forbids a bare `[` in a request target and MET's Tomcat enforces
	// it, answering "400 Invalid character found in the request target" rather
	// than serving data. Go passes RawQuery through verbatim, so nothing else
	// would fix this.
	got := safeURL("https://thredds.met.no/x.ascii?rate[0:1:23][10:1:20]")
	want := "https://thredds.met.no/x.ascii?rate%5B0:1:23%5D%5B10:1:20%5D"
	if got != want {
		t.Errorf("safeURL = %q, want %q", got, want)
	}
	// Nothing before the query is touched — a path is not a place for escaping.
	if plain := safeURL("https://example.com/a[b]"); plain != "https://example.com/a[b]" {
		t.Errorf("safeURL rewrote a URL with no query: %q", plain)
	}
}
