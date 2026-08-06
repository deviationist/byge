import { lonLatToPx } from "../components/MapCanvas";
import { DX, DY, unproject, X0, Y0 } from "./grid";
import type { RadarGrid } from "./radar";

/**
 * Where each radar cell lands on the map.
 *
 * TWO PROJECTIONS, AND THEY DO NOT AGREE. MET's grid is Lambert Conformal
 * Conic tangent at 63°N/15°E; the map is Web Mercator. LCC's meridians
 * converge on the cone's apex, so a grid that is axis-aligned in LCC arrives in
 * Mercator ROTATED by `n × Δlon` — measured at −3.8° over Oslo and −8.6° over
 * Bergen, with the sign flipping east of 15°E. Drawing the cells as an
 * axis-aligned lattice would therefore swing the whole precipitation field
 * several degrees off true, which on the one screen whose entire job is "show
 * me where the band actually is" is the wrong failure to accept.
 *
 * WHY NOT ONE AFFINE TRANSFORM, which would have been much faster — set it
 * once on the canvas and fill unit squares. It was measured rather than
 * assumed: fitting an affine from three corners of a 51×51 window leaves a
 * worst-case corner error of 0.72 cells at Oslo and Bergen, and 1.02 cells at
 * Tromsø. A full cell of misplacement at the edge of the map is visible and
 * wrong, so every vertex is projected instead.
 *
 * WHAT MAKES THAT AFFORDABLE: the vertices depend only on the WINDOW and the
 * ZOOM, never on the frame. They are computed once per view and reused for
 * every frame of a scrub or an animation, so the per-frame cost is filling
 * quads from numbers that are already there.
 */

/**
 * Grid-vertex positions in absolute Web Mercator world pixels.
 *
 * `(height + 1) × (width + 1)` points, because N cells need N+1 edges. Stored
 * flat and interleaved (x, y, x, y …) — this is read once per cell per frame,
 * and an array of objects would allocate 2 704 of them per view change.
 */
export type CellVertices = {
  /** Interleaved x,y at `2 * (i * (width + 1) + j)`. */
  xy: Float64Array;
  width: number;
  height: number;
};

/**
 * Corner vertices of every cell in the window, in world pixels at `zoom`.
 *
 * A cell's CENTRE sits at `(X0 + col·DX, Y0 + row·DY)`, so its corners are half
 * a cell out in each direction — hence the `- 0.5`. Getting that wrong shifts
 * the whole field by 500 m, which is half a cell and invisible until you
 * compare it against the coastline.
 */
export function cellVertices(grid: RadarGrid, zoom: number): CellVertices {
  const w = grid.width;
  const h = grid.height;
  const xy = new Float64Array(2 * (w + 1) * (h + 1));

  for (let i = 0; i <= h; i++) {
    for (let j = 0; j <= w; j++) {
      const mx = X0 + (grid.col0 + j - 0.5) * DX;
      const my = Y0 + (grid.row0 + i - 0.5) * DY;
      const { lat, lon } = unproject(mx, my);
      const p = lonLatToPx({ lat, lon }, zoom);
      const k = 2 * (i * (w + 1) + j);
      xy[k] = p.x;
      xy[k + 1] = p.y;
    }
  }

  return { xy, width: w, height: h };
}

/** The four corners of cell (i, j), clockwise from top-left, in world pixels. */
export function cellQuad(
  v: CellVertices,
  i: number,
  j: number,
): [number, number, number, number, number, number, number, number] {
  const stride = v.width + 1;
  const a = 2 * (i * stride + j);
  const b = 2 * (i * stride + j + 1);
  const c = 2 * ((i + 1) * stride + j + 1);
  const d = 2 * ((i + 1) * stride + j);
  return [
    v.xy[a],
    v.xy[a + 1],
    v.xy[b],
    v.xy[b + 1],
    v.xy[c],
    v.xy[c + 1],
    v.xy[d],
    v.xy[d + 1],
  ];
}

/** Reads `values` for one frame of one cell. See `RadarGrid.values`. */
export function rateAt(grid: RadarGrid, frame: number, i: number, j: number): number {
  return grid.values[frame * grid.width * grid.height + i * grid.width + j];
}
