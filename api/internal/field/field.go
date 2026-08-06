// Package field turns MET's raw radar cube into something a browser can hold.
//
// THE PROBLEM, MEASURED. One frame of the whole Nordic mosaic is 2 134 × 1 694
// float32 — 14 136 KB on the wire, and MET serves it uncompressed (verified:
// no `content-encoding` even when the request asks for gzip). That is fine for
// a 51×51 window around one saved place, which is what the verdict needs. It is
// hopeless for a map you pan across a country.
//
// This is the same wall yr hit, and their answer is pre-rendered raster tiles.
// Ours is different, because the thing we must not lose is different.
//
// WHY NOT TILES. Reading weather back out of a PNG means reverse-engineering a
// palette, and the value byge cannot afford to get wrong is not an intensity —
// it is the difference between "we looked and saw nothing" and "we could not
// look". In a rendered tile those are two colours, and telling them apart means
// trusting an exact RGB triple to survive someone else's re-encode. Here they
// are two distinct symbols that cannot be confused by any amount of resampling.
//
// WHAT IT SENDS INSTEAD: one byte per cell, holding a band index. Measured on a
// real national frame:
//
//	raw float32, as MET sends it   14 136 KB
//	raw + gzip                        503 KB
//	band index, one byte per cell   3 530 KB
//	band index + gzip                 100 KB
//
// 140× smaller than the source and 5× smaller than simply gzipping it. It
// compresses that well because the field genuinely is mostly empty: on that
// frame 56% of cells were observed dry and 35% unobserved, leaving 8% carrying
// any rain at all.
//
// WHAT IS LOST, stated plainly: the exact mm/h. A cell reports which band it
// falls in, not that it read 2.4. That is the right trade for PAINTING — the
// map draws bands, so a band is all it can show — and the exact value is still
// one small request away for the single cell someone asks about.
package field

import (
	"encoding/binary"
	"fmt"
)

// Band boundaries, mirroring web/lib/scale.ts and MET's own palette fit.
//
// COUPLING: these are the same numbers as `BANDS` in the client. They are
// duplicated rather than shared because the client must be able to colour a
// band it decoded here without a round trip, and a wire format whose meaning
// lives only on the server is one nobody can debug. A test pins them.
var Floors = [...]float64{0.03, 0.055, 0.195, 1.0, 5.7, 23.7}

const (
	// Dry means OBSERVED dry: the radar looked and nothing was falling.
	Dry byte = 0
	// NoCoverage means the mosaic cannot see this cell. Never an intensity, and
	// never folded into Dry — this distinction is the reason for the whole
	// format. It sits at the top of the range so a client that treats the byte
	// as an intensity gets an obviously wrong answer rather than a plausible
	// one.
	NoCoverage byte = 7

	// FillThreshold matches `_FillValue` 9.96921E36 in the source files.
	FillThreshold = 1e30
)

// BandOf maps a rate to its wire symbol.
func BandOf(v float64) byte {
	// NaN-safe by inversion: NaN fails every comparison, so `!(v < t)` catches
	// both the fill value and a NaN. `v >= t` would let a NaN through as an
	// observation, which is the one mistake this package exists to prevent.
	if !(v < FillThreshold) {
		return NoCoverage
	}
	if v < Floors[0] {
		return Dry
	}
	b := byte(1)
	for i, f := range Floors {
		if v >= f {
			b = byte(i + 1)
		}
	}
	return b
}

// Header prefixes the bytes so a client knows what it is holding without a
// second request or a side channel.
type Header struct {
	Frames uint16
	Width  uint16
	Height uint16
	// Top-left cell of the window in MET's grid, so the client can project it.
	Row0 int32
	Col0 int32
	// Cells skipped between samples. 1 is every cell; a zoomed-out map asks for
	// more, and MET charges the same either way because a frame is one chunk.
	Stride uint16
}

const (
	magic      = "BYGEFLD1"
	HeaderSize = len(magic) + 2 + 2 + 2 + 4 + 4 + 2
)

// EncodeBands writes the header in front of cells that are ALREADY quantised.
//
// The counterpart to Encode, for the path where the frame store did the
// quantising on the way in — it holds bands, not floats, so re-deriving them
// here would mean widening 3.6 MB back to 14 MB to narrow it again.
func EncodeBands(h Header, bands []byte) ([]byte, error) {
	want := int(h.Frames) * int(h.Width) * int(h.Height)
	if len(bands) != want {
		return nil, fmt.Errorf("field: got %d cells, header describes %d", len(bands), want)
	}
	out := make([]byte, HeaderSize+want)
	writeHeader(out, h)
	copy(out[HeaderSize:], bands)
	return out, nil
}

// Encode writes the header and one byte per cell.
//
// `values` is frame-major, then row, then column — the order MET sends and the
// order the client indexes. Getting it transposed draws a real-looking field
// rotated ninety degrees, which is why the shape is asserted rather than
// assumed.
func Encode(h Header, values []float32) ([]byte, error) {
	want := int(h.Frames) * int(h.Width) * int(h.Height)
	if len(values) != want {
		return nil, fmt.Errorf("field: got %d values, header describes %d", len(values), want)
	}

	out := make([]byte, HeaderSize+want)
	writeHeader(out, h)

	body := out[HeaderSize:]
	for i, v := range values {
		body[i] = BandOf(float64(v))
	}
	return out, nil
}

func writeHeader(out []byte, h Header) {
	copy(out, magic)
	p := len(magic)
	binary.BigEndian.PutUint16(out[p:], h.Frames)
	binary.BigEndian.PutUint16(out[p+2:], h.Width)
	binary.BigEndian.PutUint16(out[p+4:], h.Height)
	binary.BigEndian.PutUint32(out[p+6:], uint32(h.Row0))
	binary.BigEndian.PutUint32(out[p+10:], uint32(h.Col0))
	binary.BigEndian.PutUint16(out[p+14:], h.Stride)
}

// DecodeHeader reads back what Encode wrote. Exported for the tests and for any
// tooling that needs to inspect a response.
func DecodeHeader(b []byte) (Header, error) {
	if len(b) < HeaderSize || string(b[:len(magic)]) != magic {
		return Header{}, fmt.Errorf("field: not a byge field payload")
	}
	p := len(magic)
	return Header{
		Frames: binary.BigEndian.Uint16(b[p:]),
		Width:  binary.BigEndian.Uint16(b[p+2:]),
		Height: binary.BigEndian.Uint16(b[p+4:]),
		Row0:   int32(binary.BigEndian.Uint32(b[p+6:])),
		Col0:   int32(binary.BigEndian.Uint32(b[p+10:])),
		Stride: binary.BigEndian.Uint16(b[p+14:]),
	}, nil
}
