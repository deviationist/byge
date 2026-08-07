// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TILE } from "../lib/tileStore";
import { buildTileMesh, slotKey } from "./RadarTilesGL";

/**
 * THE MESH IS WHERE A COARSE TILE GOES WRONG SILENTLY.
 *
 * The texture is always 128 x 128, whatever the level, so nothing about the
 * upload or the sampling changes and every one of those paths keeps working.
 * What changes is how much GROUND one texel spans — and a level-2 tile drawn
 * with a level-0 mesh is a quarter of the size it covers, which tiles the
 * country with three-quarter gaps between the squares. It looks like missing
 * data rather than like a bug.
 */

/**
 * A named vertex of the mesh, in pixels at the given zoom.
 *
 * VERTICES, NOT A BOUNDING BOX, for anything about position. The grid is
 * Lambert Conformal Conic and the screen is Mercator, so a tile projects to a
 * slanted, slightly curved quad — over a 512 km coarse tile the meridians
 * converge enough that the leftmost point of the quad is nowhere near its
 * top-left corner. Comparing bounding boxes made two tiles that share an edge
 * exactly look 22 px apart.
 */
function corner(t: Parameters<typeof buildTileMesh>[0], zoom: number, i: number, j: number) {
  const { xy } = buildTileMesh(t, zoom);
  // The mesh is (n+1)² vertices, and it is square, so n comes from the length.
  const side = Math.sqrt(xy.length / 2);
  const n = side - 1;
  const k = 2 * ((i < 0 ? n : i) * side + (j < 0 ? n : j));
  return { x: xy[k], y: xy[k + 1] };
}

/** Corners of a mesh's projected footprint, in pixels at the given zoom. */
function extent(t: Parameters<typeof buildTileMesh>[0], zoom: number) {
  const { xy } = buildTileMesh(t, zoom);
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i]);
    x1 = Math.max(x1, xy[i]);
    y0 = Math.min(y0, xy[i + 1]);
    y1 = Math.max(y1, xy[i + 1]);
  }
  return { w: x1 - x0, h: y1 - y0, x0, y0 };
}

describe("buildTileMesh", () => {
  it("covers four times the ground per side at level 2", () => {
    const fine = extent({ row: 4, col: 3, level: 0 }, 8);
    const coarse = extent({ row: 1, col: 0, level: 2 }, 8);
    // Not exactly 4x: the projection is not linear over that distance, and the
    // two rectangles sit at different latitudes. Loose enough to allow that,
    // tight enough to catch a mesh built at the wrong scale entirely.
    expect(coarse.w / fine.w).toBeGreaterThan(3.5);
    expect(coarse.w / fine.w).toBeLessThan(4.5);
  });

  it("puts a coarse tile where its own lattice says, not where the fine one would", () => {
    // A level-2 tile at (1,0) starts at cell (512, 0) — the same cell as the
    // level-0 tile at (4, 0), so their top-left corners must land on the same
    // pixel. Scaling the size but not the ORIGIN is the other half of the same
    // mistake, and it slides the whole overlay off the map.
    const coarse = corner({ row: 1, col: 0, level: 2 }, 8, 0, 0);
    const fine = corner({ row: 4, col: 0, level: 0 }, 8, 0, 0);
    expect(Math.abs(coarse.x - fine.x)).toBeLessThan(0.01);
    expect(Math.abs(coarse.y - fine.y)).toBeLessThan(0.01);
  });

  it("meets its neighbour with no seam", () => {
    // Adjacent tiles at the same level share an edge exactly: the right column
    // of one is the left column of the next, vertex for vertex. A gap here
    // draws as a hairline of unobserved ground straight across the country.
    const rightOfA = corner({ row: 2, col: 2, level: 1 }, 9, 0, -1);
    const leftOfB = corner({ row: 2, col: 3, level: 1 }, 9, 0, 0);
    expect(Math.abs(rightOfA.x - leftOfB.x)).toBeLessThan(0.01);
    expect(Math.abs(rightOfA.y - leftOfB.y)).toBeLessThan(0.01);
  });

  it("samples the whole texture regardless of level", () => {
    // The uv coordinates are texel fractions, not cells — they must not scale
    // with the level, or a coarse tile would read a quarter of its own texture
    // and stretch it.
    for (const level of [0, 1, 2]) {
      const { uv } = buildTileMesh({ row: 1, col: 1, level }, 8);
      expect(Math.min(...uv)).toBe(0);
      expect(Math.max(...uv)).toBe(1);
    }
  });
});

describe("slotKey", () => {
  it("keeps the same lattice position at two levels apart", () => {
    // They are different rectangles on the ground; sharing a key would draw one
    // with the other's mesh for a frame after every zoom across a boundary.
    expect(slotKey({ row: 4, col: 3, level: 0 })).not.toBe(slotKey({ row: 4, col: 3, level: 2 }));
  });
});

// Guards the assumption the rest of this file rests on.
it("keeps the texture 128 square at every level", () => {
  expect(TILE).toBe(128);
});
