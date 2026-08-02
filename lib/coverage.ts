/**
 * Where the radar can and cannot see.
 *
 * MET publishes two things that look like coverage and are not:
 *
 *   - `/weatherapi/nowcast/2.0/coverage` returns a zipped shapefile
 *     (`NordicNowcast.shp`) that is a single WGS84 polygon from 2020 spanning
 *     -11.8..41.8 E. It is a *service-area envelope*.
 *   - Nowcast 2.0's `meta.radar_coverage` returns "ok" inside that envelope.
 *
 * Both report "covered" for a North Sea coordinate where the mosaic sees
 * nothing at all. Either would tell someone on an oil platform that it is dry.
 *
 * The accurate source is `_FillValue` in the gridded product we already read.
 * For a single location that arrives free inside the verdict's own subset (see
 * `Frame.observed`). This module is for the *map*, which needs the whole
 * boundary — and that boundary is ragged, following individual radar ranges
 * rather than any tidy polygon.
 *
 * Measured: at 10 km resolution the mask is ~0.6 KB gzipped and takes ~160 ms
 * to derive. It only changes when a radar goes up or down, so it is safe to
 * cache for hours.
 */

import { DX, DY, NX, NY, X0, Y0, unproject } from "./grid";
import { FILL_THRESHOLD, type Analysis, fetchVars, latestAnalysis } from "./opendap";

export type CoverageMask = {
  /** Grid cells per mask cell — 10 means one sample every 10 km. */
  stride: number;
  width: number;
  height: number;
  /** Row-major, one bit per cell, 1 = the radar can see here. */
  bits: Uint8Array;
  /** Which analysis it was derived from. */
  stamp: string;
};

function bitIndex(mask: CoverageMask, x: number, y: number): number {
  return y * mask.width + x;
}

/** Is this mask cell observed? */
export function maskAt(mask: CoverageMask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  const i = bitIndex(mask, x, y);
  return (mask.bits[i >> 3] & (0x80 >> (i & 7))) !== 0;
}

/** Fraction of the domain the radar can see. ~0.65 in practice. */
export function observedFraction(mask: CoverageMask): number {
  let seen = 0;
  const total = mask.width * mask.height;
  for (let i = 0; i < total; i++) {
    if ((mask.bits[i >> 3] & (0x80 >> (i & 7))) !== 0) seen++;
  }
  return total ? seen / total : 0;
}

/** Build a mask from a strided read of one analysis. */
export async function fetchCoverageMask(
  stride = 10,
  analysis?: Analysis,
  signal?: AbortSignal,
): Promise<CoverageMask> {
  const a = analysis ?? (await latestAnalysis(signal));
  const vars = await fetchVars(
    a.base,
    `lwe_precipitation_rate[0:1:0][0:${stride}:${NY - 1}][0:${stride}:${NX - 1}]`,
    signal,
  );
  const cube = vars.get("lwe_precipitation_rate");
  if (!cube) throw new Error("lwe_precipitation_rate missing from coverage response");

  const height = Math.ceil(NY / stride);
  const width = Math.ceil(NX / stride);
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  for (let i = 0; i < width * height; i++) {
    // NaN-safe: `< FILL_THRESHOLD` excludes both fill values and NaN, where
    // `>= FILL_THRESHOLD` would let NaN through as "observed".
    if (cube.values[i] < FILL_THRESHOLD) bits[i >> 3] |= 0x80 >> (i & 7);
  }
  return { stride, width, height, bits, stamp: a.stamp };
}

/** Mask cell -> lat/lon of its centre, for drawing the boundary on a map. */
export function maskCellToLatLon(mask: CoverageMask, x: number, y: number) {
  return unproject(X0 + x * mask.stride * DX, Y0 + y * mask.stride * DY);
}

const SERIALISE_VERSION = 1;

/** Compact form for caching in localStorage. */
export function serialiseMask(mask: CoverageMask): string {
  let bin = "";
  for (const b of mask.bits) bin += String.fromCharCode(b);
  return JSON.stringify({
    v: SERIALISE_VERSION,
    s: mask.stride,
    w: mask.width,
    h: mask.height,
    t: mask.stamp,
    b: typeof btoa === "function" ? btoa(bin) : Buffer.from(mask.bits).toString("base64"),
  });
}

export function deserialiseMask(raw: string): CoverageMask | null {
  try {
    const o = JSON.parse(raw);
    if (o.v !== SERIALISE_VERSION) return null;
    const bin =
      typeof atob === "function" ? atob(o.b) : Buffer.from(o.b, "base64").toString("binary");
    const bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
    return { stride: o.s, width: o.w, height: o.h, bits, stamp: o.t };
  } catch {
    return null;
  }
}
