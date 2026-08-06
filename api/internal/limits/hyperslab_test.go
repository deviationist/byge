package limits

import "testing"

const base = "https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc"

func TestAllowsMetadataRequests(t *testing.T) {
	// .dds/.das describe the file rather than reading it — a few KB, and the
	// client needs them to discover the latest analysis at all.
	for _, u := range []string{base + ".dds", base + ".das", base + ".html"} {
		if err := Check(u, DefaultMaxValues); err != nil {
			t.Errorf("%s rejected: %v", u, err)
		}
	}
}

func TestAllowsRealWindows(t *testing.T) {
	cases := map[string]string{
		"3 km, all frames":  ".ascii?lwe_precipitation_rate[0:1:23][1456:1:1462][557:1:563]",
		"25 km, all frames": ".ascii?lwe_precipitation_rate[0:1:23][1434:1:1484][535:1:585]",
		"single cell":       ".ascii?lwe_precipitation_rate[0:1:0][1459:1:1459][560:1:560]",
		"two variables":     ".ascii?time[0:1:23],lwe_precipitation_rate[0:1:23][1456:1:1462][557:1:563]",
	}
	for name, q := range cases {
		if err := Check(base+q, DefaultMaxValues); err != nil {
			t.Errorf("%s rejected: %v", name, err)
		}
	}
}

func TestRejectsTheWholeGrid(t *testing.T) {
	// The request this package exists for: legal OPeNDAP, allowlisted host,
	// 86.8 million values, and it makes MET decompress every time-slice.
	err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:1:2133][0:1:1693]", DefaultMaxValues)
	if err == nil {
		t.Fatal("whole-grid request was allowed")
	}
}

func TestRejectsUnindexedVariable(t *testing.T) {
	// A bare name means "all of it" — the same 347 MB by another spelling.
	if err := Check(base+".ascii?lwe_precipitation_rate", DefaultMaxValues); err == nil {
		t.Fatal("unindexed variable was allowed")
	}
}

func TestAllowsAWideSingleFrame(t *testing.T) {
	// This is what a general radar map asks for, and the old span cap refused
	// it. Measured against the live service a 501×501 single frame is 144 ms —
	// FASTER than the 947 ms a legitimate 51×51 verdict takes across 24 frames,
	// because the file is chunked one full frame per chunk. Refusing it was
	// protecting nothing.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:0][1209:1:1709][310:1:810]", DefaultMaxValues); err != nil {
		t.Fatalf("wide single frame refused: %v", err)
	}
}

func TestAllowsAFullColumnOfOneVariable(t *testing.T) {
	// 24 × 2134 × 1 = 51 216 values. The old cap refused this on the grounds
	// that it decompresses every frame — which it does, and so does every
	// verdict the app has ever issued. It costs MET the same as the request
	// this service exists to make, so refusing it was a rule that only ever
	// caught shapes, not costs. The frame cap is what bounds the real work.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:1:2133][560:1:560]", DefaultMaxValues); err != nil {
		t.Fatalf("full column refused: %v", err)
	}
}

func TestRejectsMoreFramesThanExist(t *testing.T) {
	// Time is the expensive axis, so it keeps a SPAN cap: striding it still
	// makes MET decompress every frame the range touches.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:47][0:1:10][0:1:10]", DefaultMaxValues); err == nil {
		t.Fatal("over-long frame range was allowed")
	}
	if err := Check(base+".ascii?lwe_precipitation_rate[0:5:100][0:1:10][0:1:10]", DefaultMaxValues); err == nil {
		t.Fatal("strided over-long frame range was allowed — span, not count")
	}
}

func TestRejectsTheWholeCube(t *testing.T) {
	// The request the package exists for: 86.8 million values, ~347 MB.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:1:2133][0:1:1693]", DefaultMaxValues); err == nil {
		t.Fatal("whole cube was allowed")
	}
}

func TestSumsAcrossVariables(t *testing.T) {
	// Splitting a large read across several projections must not slip under the
	// cap by being individually small.
	q := ".ascii?lwe_precipitation_rate[0:1:23][0:1:900][0:1:900]" +
		",lwe_precipitation_rate[0:1:23][0:1:900][0:1:900]"
	if err := Check(base+q, DefaultMaxValues); err == nil {
		t.Fatal("split request evaded the cap")
	}
}

func TestAllowsACoarseSurveyOfTheGrid(t *testing.T) {
	// A strided walk of the whole grid — 24 × 22 × 17 = 8 976 values. Refused
	// under the old span cap, allowed now, and the reasoning is worth stating
	// because it looks like a regression.
	//
	// It decompresses 24 frames. So does every verdict. It costs MET the same
	// as the thing this service is FOR, and it returns 36 KB. What it could be
	// used for is harvesting a coarse national picture cheaply — which the
	// client key and the per-IP rate limit bound, and which the licence permits
	// anyway: this is NLOD / CC-BY data that MET publishes openly.
	//
	// The cap's job is to stop one request doing outsized damage. This one does
	// ordinary damage.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:100:2100][0:100:1600]", DefaultMaxValues); err != nil {
		t.Fatalf("coarse survey refused: %v", err)
	}
}

func TestRejectsMalformedExpressions(t *testing.T) {
	for _, q := range []string{
		".ascii?lwe_precipitation_rate[0:1:23][1456:1:1462", // unclosed
		".ascii?lwe_precipitation_rate[abc]",                // non-numeric
		".ascii?lwe_precipitation_rate[0:0:23]",             // zero stride
		".ascii?lwe_precipitation_rate[100:1:10]",           // reversed
		".ascii?lwe_precipitation_rate[-5:1:10]",            // negative
	} {
		if err := Check(base+q, DefaultMaxValues); err == nil {
			t.Errorf("%s was allowed", q)
		}
	}
}

func TestAcceptsPercentEncodedBrackets(t *testing.T) {
	// What a browser actually sends. RFC 3986 does not permit a bare `[` in a
	// query, so encodeURI escapes it — and MET's Tomcat rejects the unescaped
	// form outright. Parsing the raw string would find no brackets and call an
	// ordinary 3 km window "unbounded", which is precisely the regression this
	// guards: the app broke against a proxy that had the cap but no decode.
	u := base + ".ascii?lwe_precipitation_rate%5B0:1:23%5D%5B1456:1:1462%5D%5B557:1:563%5D"
	if err := Check(u, DefaultMaxValues); err != nil {
		t.Fatalf("encoded window rejected: %v", err)
	}
}

func TestStillRejectsTheWholeGridWhenEncoded(t *testing.T) {
	// Encoding must not become a way around the cap.
	u := base + ".ascii?lwe_precipitation_rate%5B0:1:23%5D%5B0:1:2133%5D%5B0:1:1693%5D"
	if err := Check(u, DefaultMaxValues); err == nil {
		t.Fatal("encoded whole-grid request was allowed")
	}
}
