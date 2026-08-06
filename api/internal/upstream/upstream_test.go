package upstream

import "testing"

func TestPermittedIsPrefixExact(t *testing.T) {
	// A lookalike host must not pass. `thredds.met.no.evil.example` has our
	// allowlisted string as a prefix of its HOSTNAME, which is precisely the
	// shape a naive `strings.Contains` would wave through.
	deny := []string{
		"https://thredds.met.no.evil.example/thredds/dodsC/radarnowcasting/x",
		"https://example.com/",
		"http://169.254.169.254/latest/meta-data/",
		// Allowlisted host, endpoint we never use. Their policy names search and
		// lookup as the expensive ones, so the prefix stops at /reverse.
		"https://nominatim.openstreetmap.org/search?q=oslo",
		"https://nominatim.openstreetmap.org/",
	}
	for _, u := range deny {
		if Permitted(u) {
			t.Errorf("Permitted(%q) = true, want false", u)
		}
	}

	allow := []string{
		"https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.dds",
		"https://api.met.no/weatherapi/nowcast/2.0/complete?lat=59&lon=10",
		"https://nominatim.openstreetmap.org/reverse?lat=59.9&lon=10.7&format=jsonv2",
	}
	for _, u := range allow {
		if !Permitted(u) {
			t.Errorf("Permitted(%q) = false, want true", u)
		}
	}
}

func TestCappedOnlyGovernsOpendap(t *testing.T) {
	// The magnitude cap refuses a constraint expression with no index brackets,
	// because against thredds that means "send the entire grid" — 347 MB
	// uncompressed. The geocoder's `?lat=&lon=` has no brackets either and is a
	// perfectly ordinary request, so without this split every reverse geocode is
	// rejected by a rule written for a different upstream — and rejected as a
	// 400 about constraint expressions, which is a baffling thing to debug from
	// the client.
	if !Capped("https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.ascii?v") {
		t.Error("thredds must stay capped")
	}
	if Capped("https://nominatim.openstreetmap.org/reverse?lat=59.9&lon=10.7") {
		t.Error("the geocoder must be exempt from the OPeNDAP cap")
	}
	// Unknown targets get MORE scrutiny, not less. They are refused by the
	// allowlist first in practice, so this is belt to that braces.
	if !Capped("https://example.com/whatever?x=1") {
		t.Error("unknown targets should default to capped")
	}
}
