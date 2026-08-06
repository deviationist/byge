package limits

import (
	"os"
	"regexp"
	"strconv"
	"testing"
)

// The cap is derived from the client's own limits, which makes it explicable —
// but it also makes it silently wrong the moment either side moves. Raise
// MAX_RADIUS_KM in the app without raising it here and wide radii start failing
// with a 400 that looks like an API bug; lower it here and the app can no
// longer ask for what its own slider offers.
//
// These read the TypeScript and fail loudly rather than leaving the coupling to
// a comment nobody re-reads.

func constFromTS(t *testing.T, path, name string) int {
	t.Helper()
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read %s: %v", path, err)
	}
	re := regexp.MustCompile(`export const ` + name + `\s*=\s*(\d+)`)
	m := re.FindSubmatch(src)
	if m == nil {
		t.Fatalf("%s not found in %s — was it renamed? The cap depends on it.", name, path)
	}
	v, err := strconv.Atoi(string(m[1]))
	if err != nil {
		t.Fatalf("%s in %s is not an integer: %v", name, path, err)
	}
	return v
}

func TestMaxRadiusMatchesTheApp(t *testing.T) {
	got := constFromTS(t, "../../../web/lib/storage.ts", "MAX_RADIUS_KM")
	if got != MaxRadiusKm {
		t.Fatalf("web MAX_RADIUS_KM is %d, api MaxRadiusKm is %d — the API would reject "+
			"windows the app's own radius slider can produce", got, MaxRadiusKm)
	}
}

func TestFrameCountMatchesTheApp(t *testing.T) {
	got := constFromTS(t, "../../../web/lib/grid.ts", "NFRAMES")
	if got != MaxFrames {
		t.Fatalf("web NFRAMES is %d, api MaxFrames is %d", got, MaxFrames)
	}
}

func TestTheWidestRealRequestIsAccepted(t *testing.T) {
	// The exact shape the app produces at its maximum: every frame, a window
	// 2*MAX_RADIUS_KM+1 cells a side. If this ever fails, the cap has drifted
	// below what the UI can legitimately ask for.
	span := 2*MaxRadiusKm + 1
	url := "https://thredds.met.no/thredds/dodsC/radarnowcasting/x.nc.ascii?" +
		"lwe_precipitation_rate[0:1:" + strconv.Itoa(MaxFrames-1) + "]" +
		"[1000:1:" + strconv.Itoa(1000+span-1) + "]" +
		"[500:1:" + strconv.Itoa(500+span-1) + "]"
	if err := Check(url, DefaultMaxValues); err != nil {
		t.Fatalf("the app's widest legitimate request is rejected: %v", err)
	}
}
