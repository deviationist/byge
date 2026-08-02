// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NX, NY } from "./grid";
import {
  type CoverageMask,
  deserialiseMask,
  maskAt,
  maskCellToLatLon,
  observedFraction,
  serialiseMask,
} from "./coverage";

function build(stride: number, fill: (x: number, y: number) => boolean): CoverageMask {
  const height = Math.ceil(NY / stride);
  const width = Math.ceil(NX / stride);
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (fill(x, y)) {
        const i = y * width + x;
        bits[i >> 3] |= 0x80 >> (i & 7);
      }
    }
  }
  return { stride, width, height, bits, stamp: "20260802T120000Z" };
}

describe("maskAt", () => {
  const m = build(10, (x, y) => x === y);

  it("reads the bit it wrote", () => {
    expect(maskAt(m, 5, 5)).toBe(true);
    expect(maskAt(m, 5, 6)).toBe(false);
  });

  it("treats out-of-bounds as unobserved, never as observed", () => {
    // Erring toward "we cannot see" is the safe direction: the opposite would
    // let the map paint unknown area as observed-dry.
    expect(maskAt(m, -1, 0)).toBe(false);
    expect(maskAt(m, m.width, 0)).toBe(false);
    expect(maskAt(m, 0, m.height)).toBe(false);
  });
});

describe("observedFraction", () => {
  it("is 0 for an empty mask and 1 for a full one", () => {
    expect(observedFraction(build(10, () => false))).toBe(0);
    expect(observedFraction(build(10, () => true))).toBeCloseTo(1, 5);
  });

  it("counts a checkerboard as about half", () => {
    const f = observedFraction(build(10, (x, y) => (x + y) % 2 === 0));
    expect(f).toBeGreaterThan(0.45);
    expect(f).toBeLessThan(0.55);
  });
});

describe("serialisation", () => {
  const m = build(10, (x, y) => (x * 7 + y * 13) % 5 === 0);

  it("round-trips exactly", () => {
    const back = deserialiseMask(serialiseMask(m))!;
    expect(back.stride).toBe(m.stride);
    expect(back.width).toBe(m.width);
    expect(back.height).toBe(m.height);
    expect(back.stamp).toBe(m.stamp);
    expect(Array.from(back.bits)).toEqual(Array.from(m.bits));
  });

  it("stays small enough to cache — the point of a bitmask", () => {
    // Measured against the live grid: ~0.6 KB gzipped at 10 km.
    expect(serialiseMask(m).length).toBeLessThan(8000);
  });

  it("returns null on corrupt input rather than throwing", () => {
    expect(deserialiseMask("{not json")).toBeNull();
  });

  it("rejects a mask written by a different version", () => {
    const bumped = serialiseMask(m).replace('"v":1', '"v":99');
    expect(deserialiseMask(bumped)).toBeNull();
  });
});

describe("maskCellToLatLon", () => {
  it("puts cell 0,0 at the north-west corner of the grid", () => {
    // Yc descends, so row 0 is NORTH. Getting this backwards mirrors the whole
    // coverage overlay without raising anything.
    const m = build(10, () => true);
    const nw = maskCellToLatLon(m, 0, 0);
    const sw = maskCellToLatLon(m, 0, m.height - 1);
    expect(nw.lat).toBeGreaterThan(sw.lat);
  });

  it("moves east as x increases", () => {
    const m = build(10, () => true);
    expect(maskCellToLatLon(m, 20, 50).lon).toBeGreaterThan(maskCellToLatLon(m, 0, 50).lon);
  });
});
