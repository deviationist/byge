import { describe, expect, it } from "vitest";
import { DY, NX, NY, OutsideGridError, cellOf, clampCoord, project, unproject } from "./grid";

/**
 * Reference values generated with pyproj against the dataset's own proj4 string
 * (`spike/radar.py` PROJ4). We hand-rolled the projection to avoid a proj4
 * dependency, so these fixtures are what prove the two agree.
 *
 * A projection error is the worst kind of silent failure here: it does not
 * throw, it just returns the weather from somewhere else.
 */
const REF = [
  { name: "Oslo", lat: 59.911, lon: 10.75, x: -237085.427, y: -335805.949, row: 1461, col: 559 },
  { name: "Trondelag", lat: 63.6, lon: 9.9, x: -251899.648, y: 76712.513, row: 1048, col: 544 },
  { name: "Bergen", lat: 60.39, lon: 5.32, x: -530354.515, y: -250323.396, row: 1375, col: 266 },
  { name: "Tromso", lat: 69.65, lon: 18.96, x: 154163.064, y: 745971.317, row: 379, col: 950 },
  { name: "Copenhagen", lat: 55.68, lon: 12.57, x: -153470.943, y: -813147.88, row: 1938, col: 643 },
  { name: "Helsinki", lat: 60.17, lon: 24.94, x: 548257.921, y: -272348.151, row: 1397, col: 1344 },
  { name: "Kiruna", lat: 67.85, lon: 20.22, x: 219439.174, y: 548882.014, row: 576, col: 1015 },
  { name: "SW", lat: 58.0, lon: 5.0, x: -588998.955, y: -510763.953, row: 1636, col: 207 },
  { name: "NE", lat: 71.0, lon: 28.0, x: 472552.44, y: 940635.238, row: 184, col: 1269 },
];

describe("projection matches pyproj", () => {
  for (const r of REF) {
    it(`${r.name} projects to within a metre`, () => {
      const { x, y } = project(r.lat, r.lon);
      expect(x).toBeCloseTo(r.x, 0);
      expect(y).toBeCloseTo(r.y, 0);
    });

    it(`${r.name} lands in the same cell`, () => {
      expect(cellOf(r.lat, r.lon)).toEqual({ row: r.row, col: r.col });
    });
  }
});

describe("round trip", () => {
  for (const r of REF) {
    it(`${r.name} survives project -> unproject`, () => {
      const { x, y } = project(r.lat, r.lon);
      const back = unproject(x, y);
      expect(back.lat).toBeCloseTo(r.lat, 6);
      expect(back.lon).toBeCloseTo(r.lon, 6);
    });
  }
});

describe("grid orientation", () => {
  it("Yc descends — row 0 is north", () => {
    // Fails silently by mirroring the field, so it gets an explicit assertion.
    expect(DY).toBeLessThan(0);
  });

  it("a northern point has a lower row index than a southern one", () => {
    const north = cellOf(69.65, 18.96); // Tromsø
    const south = cellOf(55.68, 12.57); // Copenhagen
    expect(north.row).toBeLessThan(south.row);
  });

  it("an eastern point has a higher col index than a western one", () => {
    expect(cellOf(60.17, 24.94).col).toBeGreaterThan(cellOf(60.39, 5.32).col);
  });
});

describe("domain", () => {
  it("rejects a coordinate outside the grid", () => {
    // Better a clear error than a silently clamped lookup.
    expect(() => cellOf(0, 0)).toThrow(OutsideGridError);
  });

  it("rejects Svalbard, which is north of the mosaic", () => {
    expect(() => cellOf(78.223, 15.627)).toThrow(OutsideGridError);
  });

  it("every reference point is inside the pinned dimensions", () => {
    for (const r of REF) {
      expect(r.row).toBeGreaterThanOrEqual(0);
      expect(r.row).toBeLessThan(NY);
      expect(r.col).toBeGreaterThanOrEqual(0);
      expect(r.col).toBeLessThan(NX);
    }
  });
});

describe("coordinate clamping", () => {
  it("rounds to 4 decimals — MET rejects finer with HTTP 403", () => {
    expect(clampCoord(59.91234567)).toBe(59.9123);
    expect(clampCoord(-10.98765432)).toBe(-10.9877);
  });

  it("breaks exact ties toward +infinity, per Math.round", () => {
    // -10.98765 sits exactly on the boundary and rounds to -10.9876, not
    // -10.9877. Documented rather than corrected: the difference is 1.1 cm on a
    // 1 km grid, so no rounding rule here is more correct than another.
    expect(clampCoord(-10.98765)).toBe(-10.9876);
  });

  it("leaves already-short coordinates alone", () => {
    expect(clampCoord(59.91)).toBe(59.91);
  });
});
