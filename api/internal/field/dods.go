package field

import (
	"encoding/binary"
	"fmt"
	"math"
)

// ParseDods pulls the float array out of an OPeNDAP `.dods` response.
//
// The format is the DDS text, the literal marker `Data:\n`, then XDR — which is
// big-endian and unpadded for float32. A Grid sends its ARRAY first, prefixed
// by the element count TWICE (a quirk of the encoding: the same length word is
// written once for the array and once for its own length), then the coordinate
// MAPS. We only ever want the array, so everything after it is ignored.
//
// Deliberately minimal. A general DODS parser is a large surface for a service
// that requests exactly one variable of one shape from one allowlisted dataset,
// and every extra branch is a place to mis-read someone else's bytes as
// weather.
func ParseDods(b []byte, want int) ([]float32, error) {
	i := indexOf(b, []byte("Data:\n"))
	if i < 0 {
		// An error from THREDDS arrives as a text body with no Data section —
		// "Error { code = 404; ... }". Saying so beats returning an empty grid
		// that renders as a clear sky.
		return nil, fmt.Errorf("field: no Data section in upstream response")
	}
	body := b[i+len("Data:\n"):]
	if len(body) < 8 {
		return nil, fmt.Errorf("field: truncated upstream response")
	}

	n := int(binary.BigEndian.Uint32(body[:4]))
	if n != want {
		return nil, fmt.Errorf("field: upstream sent %d values, expected %d", n, want)
	}
	body = body[8:] // both length words
	if len(body) < 4*n {
		return nil, fmt.Errorf("field: upstream sent %d bytes for %d values", len(body), n)
	}

	out := make([]float32, n)
	for k := 0; k < n; k++ {
		out[k] = math.Float32frombits(binary.BigEndian.Uint32(body[4*k:]))
	}
	return out, nil
}

func indexOf(h, needle []byte) int {
	for i := 0; i+len(needle) <= len(h); i++ {
		match := true
		for j := range needle {
			if h[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
