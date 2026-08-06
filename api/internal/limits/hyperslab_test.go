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

func TestRejectsOneHugeDimension(t *testing.T) {
	// Narrow in two dimensions, enormous in the third — still a full-column
	// read, and still forces the same decompression.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:1:2133][560:1:560]", DefaultMaxValues); err == nil {
		t.Fatal("full-column request was allowed")
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

func TestRejectsStridedGridWalks(t *testing.T) {
	// A coarse stride returns fewer values but costs MET the same: the file is
	// chunked one full time-slice per chunk, so touching row 0 and row 2100
	// decompresses everything between. Bounding the value count instead of the
	// span would make this the cheapest way to harvest the grid.
	if err := Check(base+".ascii?lwe_precipitation_rate[0:1:23][0:100:2100][0:100:1600]", DefaultMaxValues); err == nil {
		t.Fatal("strided grid walk was allowed")
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
