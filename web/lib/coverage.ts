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
 *
 * THERE IS NO LONGER A FETCHER HERE. Deriving the mask meant a strided read of
 * the entire domain, which was the only request the client made that needed to
 * name a whole file rather than a window — and the map stopped needing it once
 * `/field` began carrying "not observed" as a band of its own (fieldFormat's
 * NO_COVERAGE), which is the same information at the resolution being drawn and
 * arrives with the data instead of alongside it. What is left is the mask type
 * and its pure readers, still the right shape if a boundary overlay ever wants
 * one, with nothing left to build it out of a URL.
 */

import { DX, DY, unproject, X0, Y0 } from "./grid";

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
