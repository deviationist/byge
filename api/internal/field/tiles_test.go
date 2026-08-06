package field

import (
	"testing"
)

/**
 * The tile format exists so a client can fetch the set difference between what
 * it needs and what it holds. Everything here protects one of the two things
 * that makes that possible: tiles are all the same size, and a tile means the
 * same rectangle to everybody.
 */

func TestTileHeaderRoundTrips(t *testing.T) {
	in := TileHeader{
		Frames:   24,
		TileSize: TileSize,
		Tiles:    []Tile{{Row: 0, Col: 0}, {Row: 11, Col: 4}, {Row: 16, Col: 13}},
	}
	out, err := DecodeTileHeader(EncodeTileHeader(in))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Frames != in.Frames || out.TileSize != in.TileSize || len(out.Tiles) != len(in.Tiles) {
		t.Fatalf("header changed: %+v want %+v", out, in)
	}
	for i := range in.Tiles {
		if out.Tiles[i] != in.Tiles[i] {
			t.Errorf("tile %d = %+v, want %+v", i, out.Tiles[i], in.Tiles[i])
		}
	}
}

func TestTileHeaderRefusesSomethingElse(t *testing.T) {
	// Almost always an error page arriving where binary was expected.
	if _, err := DecodeTileHeader([]byte("<!doctype html><title>502</title>")); err == nil {
		t.Error("an HTML body decoded as a tile header")
	}
	// A header claiming more tiles than the bytes can describe must not be read
	// past its end.
	full := EncodeTileHeader(TileHeader{Frames: 1, TileSize: TileSize, Tiles: []Tile{{}, {}, {}}})
	if _, err := DecodeTileHeader(full[:len(full)-4]); err == nil {
		t.Error("a truncated header was accepted")
	}
}

func TestCutTileFillsOffGridWithNoCoverage(t *testing.T) {
	// THE ONE THAT MATTERS. Zero is Dry, so a tile hanging off the edge of the
	// domain would report the open Atlantic as looked-at and rainless. Every
	// cell outside the grid has to be NoCoverage — the mosaic genuinely cannot
	// see there, and saying "dry" instead is the mistake the whole format is
	// built to prevent.
	nx, ny := 300, 200 // a tiny grid, so one tile overhangs it hugely
	frame := make([]byte, nx*ny)
	for i := range frame {
		frame[i] = Dry
	}

	// Tile (1,2) starts at row 128, col 256 — its right and bottom hang off.
	out := CutTile(frame, Tile{Row: 1, Col: 2}, nx, ny)
	if len(out) != TileSize*TileSize {
		t.Fatalf("tile is %d bytes, want %d", len(out), TileSize*TileSize)
	}

	inside, outside := 0, 0
	for i := 0; i < TileSize; i++ {
		for j := 0; j < TileSize; j++ {
			r, c := 128+i, 256+j
			got := out[i*TileSize+j]
			if r < ny && c < nx {
				inside++
				if got != Dry {
					t.Fatalf("cell (%d,%d) inside the grid = %d, want Dry", r, c, got)
				}
			} else {
				outside++
				if got != NoCoverage {
					t.Fatalf("cell (%d,%d) outside the grid = %d, want NoCoverage", r, c, got)
				}
			}
		}
	}
	if inside == 0 || outside == 0 {
		t.Fatalf("test grid does not straddle the edge: %d in, %d out", inside, outside)
	}
}

func TestCutTileCopiesTheRightRectangle(t *testing.T) {
	// A tile that means a different rectangle on the two sides would cache
	// perfectly and paint the country shifted.
	nx, ny := 4*TileSize, 3*TileSize
	frame := make([]byte, nx*ny)
	// Each cell carries its own tile row so a misaligned copy is obvious.
	for r := 0; r < ny; r++ {
		for c := 0; c < nx; c++ {
			frame[r*nx+c] = byte(r/TileSize)*3 + byte(c/TileSize)
		}
	}
	out := CutTile(frame, Tile{Row: 2, Col: 3}, nx, ny)
	want := byte(2)*3 + 3
	for i, v := range out {
		if v != want {
			t.Fatalf("byte %d of tile (2,3) = %d, want %d", i, v, want)
		}
	}
}

func TestTileHeaderSizeMatchesWhatIsWritten(t *testing.T) {
	// The client slices the payload at exactly this offset. Off by one and every
	// tile is read shifted by a byte, which draws a plausible-looking field that
	// is wrong everywhere.
	for _, n := range []int{0, 1, 40, 160} {
		tiles := make([]Tile, n)
		if got := len(EncodeTileHeader(TileHeader{Tiles: tiles})); got != TileHeaderSize(n) {
			t.Errorf("%d tiles: wrote %d bytes, TileHeaderSize says %d", n, got, TileHeaderSize(n))
		}
	}
}
