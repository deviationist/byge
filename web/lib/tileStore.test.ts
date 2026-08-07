// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NO_COVERAGE } from "./fieldFormat";
import { NX, NY } from "./grid";
import { MISSING_TILE, TILE, TILE_COLS, TILE_ROWS, TileStore, tilesFor } from "./tileStore";

/**
 * The store is the point of the whole tiled design: fetch a square once, and
 * every later view that touches it is free. These protect the three things that
 * would quietly break that — a tile meaning different rectangles at different
 * times, a stale run leaking into a fresh one, and an unbounded cache.
 */

const cells = (fill: number) => new Uint8Array(TILE * TILE).fill(fill);

describe("TileStore", () => {
  it("returns what it was given, and nothing for what it was not", () => {
    const s = new TileStore();
    s.use("20260806T120000Z");
    s.put({ row: 11, col: 4, level: 0 }, 0, cells(3));
    expect(s.get({ row: 11, col: 4, level: 0 }, 0)?.[0]).toBe(3);
    expect(s.get({ row: 11, col: 4, level: 0 }, 1)).toBeNull();
    expect(s.get({ row: 11, col: 5, level: 0 }, 0)).toBeNull();
  });

  it("drops everything when the analysis changes", () => {
    // A five-minute-old run describes the same squares with different weather.
    // Sharing a key between runs would paint the past.
    const s = new TileStore();
    s.use("20260806T120000Z");
    s.put({ row: 1, col: 1, level: 0 }, 0, cells(3));
    s.use("20260806T120500Z");
    expect(s.get({ row: 1, col: 1, level: 0 }, 0)).toBeNull();
    expect(s.stats().bytes).toBe(0);
  });

  it("keeps everything when the analysis has not changed", () => {
    const s = new TileStore();
    s.use("20260806T120000Z");
    s.put({ row: 1, col: 1, level: 0 }, 0, cells(3));
    s.use("20260806T120000Z");
    expect(s.get({ row: 1, col: 1, level: 0 }, 0)).not.toBeNull();
  });

  it("asks only for what it does not hold", () => {
    // The whole reason the store exists. Zoom out and the square already on
    // screen must not be requested again.
    const s = new TileStore();
    s.use("A");
    const wanted = [
      { row: 1, col: 1, level: 0 },
      { row: 1, col: 2, level: 0 },
      { row: 2, col: 1, level: 0 },
    ];
    for (let f = 0; f < 3; f++) s.put({ row: 1, col: 1, level: 0 }, f, cells(1));
    // Held for every frame → excluded. Held for some → still needed.
    s.put({ row: 1, col: 2, level: 0 }, 0, cells(1));

    const missing = s.missing(wanted, 3);
    expect(missing.map((t) => `${t.row}.${t.col}`)).toEqual(["1.2", "2.1"]);
  });

  it("plays only as deep as its shallowest visible tile", () => {
    // A ragged cache is the normal state after a zoom out: 24 frames of the
    // square you came from, fewer of its new neighbours. Animating past the
    // shallowest would leave holes, and a hole is indistinguishable from
    // observed-dry.
    const s = new TileStore();
    s.use("A");
    const a = { row: 1, col: 1, level: 0 };
    const b = { row: 1, col: 2, level: 0 };
    for (let f = 0; f < 10; f++) s.put(a, f, cells(1));
    for (let f = 0; f < 3; f++) s.put(b, f, cells(1));

    expect(s.depth([a], 24)).toBe(10);
    expect(s.depth([a, b], 24)).toBe(3);
    // And it never claims more than the view asked for.
    expect(s.depth([a], 5)).toBe(5);
  });

  it("evicts least-recently-used once the budget is spent", () => {
    // Unbounded is what crashed this tab once already.
    const one = TILE * TILE;
    const s = new TileStore(one * 3);
    s.use("A");
    for (let i = 0; i < 3; i++) s.put({ row: i, col: 0, level: 0 }, 0, cells(i));

    // Touch the oldest so it is no longer the oldest.
    expect(s.get({ row: 0, col: 0, level: 0 }, 0)).not.toBeNull();
    s.put({ row: 9, col: 9, level: 0 }, 0, cells(9));

    expect(s.stats().bytes).toBeLessThanOrEqual(one * 3);
    // 1.0 was next-oldest after the touch, so it is the one that went.
    expect(s.get({ row: 1, col: 0, level: 0 }, 0)).toBeNull();
    expect(s.get({ row: 0, col: 0, level: 0 }, 0)).not.toBeNull();
    expect(s.get({ row: 9, col: 9, level: 0 }, 0)).not.toBeNull();
  });

  it("refuses a tile that is not tile-shaped", () => {
    // A short tile would be read as a full one and paint garbage past its end.
    const s = new TileStore();
    s.use("A");
    expect(() => s.put({ row: 0, col: 0, level: 0 }, 0, new Uint8Array(10))).toThrow(/cells/);
  });
});

describe("MISSING_TILE", () => {
  it("is unobserved, never dry", () => {
    // The cardinal rule. A square we have not downloaded must not be drawn as
    // one the radar looked at and found empty.
    expect(MISSING_TILE.length).toBe(TILE * TILE);
    expect(MISSING_TILE.every((v) => v === NO_COVERAGE)).toBe(true);
  });
});

describe("tilesFor", () => {
  it("covers the rectangle it is given", () => {
    // One tile when the window sits inside one.
    expect(tilesFor(TILE * 2, TILE * 3, 4, 4)).toEqual([{ row: 2, col: 3, level: 0 }]);
    // Four when it straddles a corner.
    const corner = tilesFor(TILE - 1, TILE - 1, 2, 2);
    expect(corner).toHaveLength(4);
  });

  it("clips to the lattice rather than inventing edge tiles", () => {
    // A map panned into the Atlantic covers nothing there. Clamping instead
    // would put the coastline's data in the ocean.
    expect(tilesFor(-1000, -1000, 10, 10)).toEqual([]);
    const past = tilesFor(NY - 1, NX - 1, 500, 500);
    expect(past).toEqual([{ row: TILE_ROWS - 1, col: TILE_COLS - 1, level: 0 }]);
  });

  it("sizes the lattice from the grid", () => {
    expect(TILE_ROWS).toBe(Math.ceil(NY / TILE));
    expect(TILE_COLS).toBe(Math.ceil(NX / TILE));
  });
});

describe("tilesFor", () => {
  it("covers a window with the tiles that overlap it", () => {
    const t = tilesFor(0, 0, 1, 1);
    expect(t).toEqual([{ row: 0, col: 0, level: 0 }]);
    expect(tilesFor(0, 0, TILE + 1, TILE + 1)).toHaveLength(4);
  });

  it("needs a quarter as many tiles per side at level 2", () => {
    // THE POINT OF THE PYRAMID. A window wide enough to need 8x8 fine tiles
    // needs 2x2 coarse ones, and since the API charges by frames x tiles, the
    // wide view stops trading frames away for area.
    const wide = TILE * 8;
    expect(tilesFor(0, 0, wide, wide, 0)).toHaveLength(64);
    expect(tilesFor(0, 0, wide, wide, 2)).toHaveLength(4);
  });

  it("stamps the level onto every tile it returns", () => {
    // The level is part of the identity, not a fetch parameter: a coarse tile
    // at (0,0) is a different picture from a fine one, so it must not share a
    // cache entry with it.
    for (const t of tilesFor(0, 0, TILE * 3, TILE * 3, 1)) expect(t.level).toBe(1);
  });

  it("keeps a coarse tile and a fine tile apart in the cache", () => {
    const s = new TileStore();
    s.use("A");
    s.put({ row: 0, col: 0, level: 0 }, 0, cells(1));
    expect(s.get({ row: 0, col: 0, level: 2 }, 0)).toBeNull();
  });
});
