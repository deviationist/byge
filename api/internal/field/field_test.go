package field

import "testing"

/**
 * The wire format's whole reason for existing is that two of these symbols must
 * never be confused. Everything else is compression.
 */

func TestNoCoverageIsNeverAnIntensity(t *testing.T) {
	// The distinction byge is built on. A cell the mosaic cannot see, given any
	// band at all, becomes an observation we do not have.
	if got := BandOf(9.96921e36); got != NoCoverage {
		t.Errorf("fill value → %d, want NoCoverage (%d)", got, NoCoverage)
	}
	if got := BandOf(FillThreshold); got != NoCoverage {
		t.Errorf("threshold → %d, want NoCoverage", got)
	}
}

func TestNaNIsUnobservedNotZero(t *testing.T) {
	// NaN fails every comparison, so a `>=` test lets it through as observed
	// and it paints as dry ground over open sea.
	nan := float64(0)
	nan = nan / nan
	if got := BandOf(nan); got != NoCoverage {
		t.Errorf("NaN → %d, want NoCoverage", got)
	}
}

func TestObservedDryIsDistinctFromNoCoverage(t *testing.T) {
	// The other half. Collapsing these two is the same bug in the other
	// direction, and it is the one that reads as reassuring.
	if BandOf(0) != Dry {
		t.Error("zero should be observed dry")
	}
	if Dry == NoCoverage {
		t.Fatal("dry and no-coverage must not share a symbol")
	}
}

func TestBandsMatchTheClientScale(t *testing.T) {
	// COUPLING with web/lib/scale.ts. These floors are duplicated there so the
	// client can colour a band without a round trip; if they drift, the map
	// paints one thing and the sentence says another.
	want := []struct {
		rate float64
		band byte
	}{
		{0.02, 0}, {0.03, 1}, {0.054, 1}, {0.055, 2}, {0.194, 2},
		{0.195, 3}, {0.9, 3}, {1.0, 4}, {5.6, 4}, {5.7, 5}, {23.6, 5}, {23.7, 6}, {100, 6},
	}
	for _, c := range want {
		if got := BandOf(c.rate); got != c.band {
			t.Errorf("%g mm/h → band %d, want %d", c.rate, got, c.band)
		}
	}
}

func TestRoundTripsItsHeader(t *testing.T) {
	h := Header{Frames: 2, Width: 3, Height: 4, Row0: 1459, Col0: 560, Stride: 5}
	b, err := Encode(h, make([]float32, 2*3*4))
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeHeader(b)
	if err != nil {
		t.Fatal(err)
	}
	if got != h {
		t.Errorf("header round-trip: got %+v want %+v", got, h)
	}
}

func TestRefusesAShapeItCannotDescribe(t *testing.T) {
	// A header that disagrees with the payload would be decoded as a real field
	// of the wrong shape — a plausible picture of nothing.
	if _, err := Encode(Header{Frames: 1, Width: 4, Height: 4}, make([]float32, 15)); err == nil {
		t.Fatal("mismatched value count was accepted")
	}
}

func TestRejectsForeignPayloads(t *testing.T) {
	if _, err := DecodeHeader([]byte("not a field at all")); err == nil {
		t.Fatal("foreign payload was decoded")
	}
}
