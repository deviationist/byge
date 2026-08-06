import { describe, expect, it } from "vitest";
import { lonLatToPx } from "../components/MapCanvas";
import { cellOf, DX, DY, unproject, X0, Y0 } from "./grid";
import type { RadarGrid } from "./radar";
import { cellQuad, cellVertices, rateAt } from "./radarGeometry";

/**
 * Two projections that do not agree. Everything here fails silently: a wrong
 * offset draws a real-looking band over the wrong fjord, and nothing throws.
 */

const OSLO = { lat: 59.9273, lon: 10.7607 };

function windowAround(lat: number, lon: number, half: number): RadarGrid {
  const { row, col } = cellOf(lat, lon);
  const n = 2 * half + 1;
  return {
    row0: row - half,
    col0: col - half,
    width: n,
    height: n,
    values: new Float64Array(n * n * 24),
  };
}

describe("cellVertices", () => {
  it("produces one more vertex than cells in each direction", () => {
    // N cells need N+1 edges. Off by one here and the last row and column of
    // the field are never drawn.
    const v = cellVertices(windowAround(OSLO.lat, OSLO.lon, 3), 11);
    expect(v.xy.length).toBe(2 * 8 * 8);
  });

  it("puts the cell CENTRE at the middle of its quad, not at a corner", () => {
    // The grid indexes centres; the drawing needs corners. Skipping the half
    // cell offset shifts the whole field 500 m — half a cell, and invisible
    // until you compare it against a coastline.
    const grid = windowAround(OSLO.lat, OSLO.lon, 2);
    const v = cellVertices(grid, 12);
    const q = cellQuad(v, 2, 2);
    const midX = (q[0] + q[4]) / 2;
    const midY = (q[1] + q[5]) / 2;

    const centre = unproject(X0 + (grid.col0 + 2) * DX, Y0 + (grid.row0 + 2) * DY);
    const want = lonLatToPx(centre, 12);

    // Measured against the CELL, which is the only scale that means anything
    // here. The diagonal midpoint of a projected quad is not exactly the
    // projected centre — the projection is not linear — but the gap is a
    // ten-thousandth of a cell. A missing half-cell offset would be 0.5.
    const q0 = cellQuad(v, 2, 2);
    const cellPx = Math.hypot(q0[2] - q0[0], q0[3] - q0[1]);
    expect(Math.hypot(midX - want.x, midY - want.y) / cellPx).toBeLessThan(0.01);
  });

  it("carries the LCC-to-Mercator rotation rather than drawing a lattice", () => {
    // The whole reason this file exists. At Oslo the grid arrives rotated about
    // -3.8 degrees (n × Δlon, with n = sin 63°). An axis-aligned lattice would
    // report 0 and swing the field several degrees off true.
    const v = cellVertices(windowAround(OSLO.lat, OSLO.lon, 25), 11);
    const stride = v.width + 1;
    const x0 = v.xy[0];
    const y0 = v.xy[1];
    const xN = v.xy[2 * v.width];
    const yN = v.xy[2 * v.width + 1];
    const deg = (Math.atan2(yN - y0, xN - x0) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(-4.5);
    expect(deg).toBeLessThan(-3.0);
    expect(stride).toBe(v.width + 1);
  });

  it("flips the rotation east of the reference meridian", () => {
    // lon0 is 15°E. West of it the convergence is negative, east positive —
    // a sign error would mirror the field about the wrong axis, which looks
    // entirely plausible on screen.
    const east = cellVertices(windowAround(69.65, 18.96, 20), 11);
    const dx = east.xy[2 * east.width] - east.xy[0];
    const dy = east.xy[2 * east.width + 1] - east.xy[1];
    expect((Math.atan2(dy, dx) * 180) / Math.PI).toBeGreaterThan(0);
  });

  it("scales with zoom, doubling each level", () => {
    const g = windowAround(OSLO.lat, OSLO.lon, 5);
    const a = cellVertices(g, 10);
    const b = cellVertices(g, 11);
    const spanA = Math.hypot(a.xy[2 * a.width] - a.xy[0], a.xy[2 * a.width + 1] - a.xy[1]);
    const spanB = Math.hypot(b.xy[2 * b.width] - b.xy[0], b.xy[2 * b.width + 1] - b.xy[1]);
    expect(spanB / spanA).toBeCloseTo(2, 2);
  });

  it("keeps cells very nearly square, because a stretched cell misstates the band", () => {
    const v = cellVertices(windowAround(OSLO.lat, OSLO.lon, 10), 11);
    const q = cellQuad(v, 5, 5);
    const top = Math.hypot(q[2] - q[0], q[3] - q[1]);
    const left = Math.hypot(q[6] - q[0], q[7] - q[1]);
    expect(Math.abs(top - left) / top).toBeLessThan(0.02);
  });
});

describe("rateAt", () => {
  it("indexes frame-major, then row, then column", () => {
    // A transposed read draws yesterday's shape rotated 90 degrees and still
    // looks like weather.
    const g = windowAround(OSLO.lat, OSLO.lon, 1);
    const vals = g.values as Float64Array;
    const n = g.width * g.height;
    vals[n * 2 + 1 * g.width + 2] = 7.5;
    expect(rateAt(g, 2, 1, 2)).toBe(7.5);
    expect(rateAt(g, 2, 2, 1)).toBe(0);
    expect(rateAt(g, 0, 1, 2)).toBe(0);
  });
});
