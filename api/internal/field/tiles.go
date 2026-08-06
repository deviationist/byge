package field

import (
	"encoding/binary"
	"fmt"
)

// The TILED wire format, and why the field format above was not enough.
//
// THE PROBLEM. `/field` serves the rectangle you are looking at. Pan a little
// and you get a new rectangle overlapping the old one by ninety per cent; zoom
// out and you get a rectangle CONTAINING the one already on screen, refetched
// whole. The client had no way to say "I have the middle" because a rectangle
// minus its middle is not a rectangle, so every view paid for cells it was
// already holding. On a national window that is tens of megabytes of the
// reader's bandwidth spent re-downloading what is on their screen.
//
// THE FIX is the one every slippy map reaches: quantise the world into fixed
// tiles aligned to the grid, and make a request a LIST of tiles rather than a
// rectangle. Then "what am I missing" is a set difference, which a client can
// compute exactly, and a tile once held is never fetched again for as long as
// it is worth keeping.
//
// TILES ARE ALWAYS FULL SIZE, including at the edges of the grid, where the
// cells beyond the domain are NoCoverage. That is honest — the mosaic genuinely
// cannot see the Atlantic — and it means every tile in a payload is the same
// length, so the client can count complete frames by division instead of
// carrying a per-tile size table.
//
// FRAME-MAJOR, not tile-major: every tile of frame 0, then every tile of frame
// 1. So the stream delivers a complete picture of NOW first and gains time
// depth as it goes. Tile-major would deliver a complete animation of one corner
// and nothing anywhere else, which is the wrong thing to look at while waiting.

const (
	tileMagic = "BYGETIL1"
	// TileSize is fixed rather than negotiable. A tile is the unit of caching on
	// both sides, so two clients disagreeing about it would share nothing, and a
	// client that changed its mind mid-session would orphan everything it held.
	//
	// 128 cells = 128 km square = 16 KB a frame. Small enough that a pan discards
	// little and a partly-covered viewport does not drag in a lot of off-screen
	// data; large enough that a national view is ~100 tiles rather than
	// thousands, and that per-tile overhead stays negligible against the payload.
	TileSize = 128
)

// TileHeaderSize is the header for a payload carrying n tiles.
func TileHeaderSize(n int) int {
	return len(tileMagic) + 2 + 2 + 2 + n*8
}

// Tile identifies one tile by its position in the tile lattice, NOT in cells.
// Origin in cells is Row*TileSize, Col*TileSize.
type Tile struct {
	Row, Col int32
}

// TileHeader prefixes a tiled payload.
type TileHeader struct {
	// Frames the server intends to send. What actually arrived is the client's
	// own arithmetic on the bytes — see the note on streaming in handler/tiles.go.
	Frames   uint16
	TileSize uint16
	Tiles    []Tile
}

// EncodeTileHeader writes the header. The body follows frame-major, each tile
// exactly TileSize² bytes.
func EncodeTileHeader(h TileHeader) []byte {
	out := make([]byte, TileHeaderSize(len(h.Tiles)))
	copy(out, tileMagic)
	p := len(tileMagic)
	binary.BigEndian.PutUint16(out[p:], h.Frames)
	binary.BigEndian.PutUint16(out[p+2:], h.TileSize)
	binary.BigEndian.PutUint16(out[p+4:], uint16(len(h.Tiles)))
	p += 6
	for _, t := range h.Tiles {
		binary.BigEndian.PutUint32(out[p:], uint32(t.Row))
		binary.BigEndian.PutUint32(out[p+4:], uint32(t.Col))
		p += 8
	}
	return out
}

// DecodeTileHeader reads back what EncodeTileHeader wrote. For the tests, and
// for anyone inspecting a response by hand.
func DecodeTileHeader(b []byte) (TileHeader, error) {
	if len(b) < TileHeaderSize(0) || string(b[:len(tileMagic)]) != tileMagic {
		return TileHeader{}, fmt.Errorf("field: not a byge tile payload")
	}
	p := len(tileMagic)
	h := TileHeader{
		Frames:   binary.BigEndian.Uint16(b[p:]),
		TileSize: binary.BigEndian.Uint16(b[p+2:]),
	}
	n := int(binary.BigEndian.Uint16(b[p+4:]))
	if len(b) < TileHeaderSize(n) {
		return TileHeader{}, fmt.Errorf("field: tile header claims %d tiles, body is too short", n)
	}
	p += 6
	h.Tiles = make([]Tile, n)
	for i := range h.Tiles {
		h.Tiles[i] = Tile{
			Row: int32(binary.BigEndian.Uint32(b[p:])),
			Col: int32(binary.BigEndian.Uint32(b[p+4:])),
		}
		p += 8
	}
	return h, nil
}

// CutTile copies one tile out of a whole quantised frame.
//
// `nx`/`ny` are the grid's dimensions. Cells outside the grid are filled with
// NoCoverage rather than left zero: zero is Dry, and a tile at the edge of the
// domain would otherwise report the open Atlantic as observed and rainless —
// the exact confusion this entire format exists to prevent.
func CutTile(frame []byte, t Tile, nx, ny int) []byte {
	out := make([]byte, TileSize*TileSize)
	for i := range out {
		out[i] = NoCoverage
	}
	row0 := int(t.Row) * TileSize
	col0 := int(t.Col) * TileSize
	for i := 0; i < TileSize; i++ {
		r := row0 + i
		if r < 0 || r >= ny {
			continue
		}
		lo := col0
		hi := col0 + TileSize
		if lo < 0 {
			lo = 0
		}
		if hi > nx {
			hi = nx
		}
		if lo >= hi {
			continue
		}
		copy(out[i*TileSize+(lo-col0):], frame[r*nx+lo:r*nx+hi])
	}
	return out
}
