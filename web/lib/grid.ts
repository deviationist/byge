/**
 * Geometry of MET Norway's `yrwms-nordic` radar grid.
 *
 * Lambert Conformal Conic on a sphere:
 *   +proj=lcc +lat_0=63 +lon_0=15 +lat_1=63 +lat_2=63 +R=6.371e+06
 *
 * Both standard parallels are 63°, so this is the *tangent* case and the
 * projection reduces to closed-form spherical maths — no proj4 dependency, and
 * no risk of a subtly different datum. Verified against pyproj to sub-metre
 * agreement across the domain (see grid.test.ts).
 *
 * Grid constants are pinned rather than read at runtime: that is what makes a
 * probe one request instead of four. spike/tests/test_source.py asserts them
 * against the live dataset so they cannot drift unnoticed.
 */

export const PROJ = {
  R: 6.371e6,
  lat0: 63,
  lon0: 15,
} as const;

/** Grid origin and spacing, metres in projection space. */
export const X0 = -796_000;
export const DX = 1000;
export const NX = 1694;

/**
 * NOTE: DY is NEGATIVE. Yc descends — row 0 is the NORTH edge. Getting this
 * backwards mirrors the entire field vertically without raising anything.
 */
export const Y0 = 1_125_000;
export const DY = -1000;
export const NY = 2134;

/** Forecast frames per analysis, and the step between them. */
export const NFRAMES = 24;
export const STEP_S = 300;
export const HORIZON_MIN = ((NFRAMES - 1) * STEP_S) / 60; // 115

const RAD = Math.PI / 180;

// Tangent-case LCC constants, precomputed once.
const phi0 = PROJ.lat0 * RAD;
const n = Math.sin(phi0);
const F = (Math.cos(phi0) * Math.tan(Math.PI / 4 + phi0 / 2) ** n) / n;
const rho0 = (PROJ.R * F) / Math.tan(Math.PI / 4 + phi0 / 2) ** n;

export type XY = { x: number; y: number };
export type Cell = { row: number; col: number };

/** lat/lon (degrees) -> projection metres. */
export function project(lat: number, lon: number): XY {
  const phi = lat * RAD;
  const rho = (PROJ.R * F) / Math.tan(Math.PI / 4 + phi / 2) ** n;
  // Normalise the meridian difference into (-180, 180] before scaling by n,
  // otherwise a longitude wrap puts the point on the far side of the cone.
  let dl = lon - PROJ.lon0;
  while (dl > 180) dl -= 360;
  while (dl <= -180) dl += 360;
  const theta = n * dl * RAD;
  return { x: rho * Math.sin(theta), y: rho0 - rho * Math.cos(theta) };
}

/** projection metres -> lat/lon (degrees). Needed to draw the coverage mask. */
export function unproject(x: number, y: number): { lat: number; lon: number } {
  const dy = rho0 - y;
  const rho = Math.sign(n) * Math.hypot(x, dy);
  const theta = Math.atan2(x, dy);
  const lat = (2 * Math.atan(((PROJ.R * F) / rho) ** (1 / n)) - Math.PI / 2) / RAD;
  const lon = theta / n / RAD + PROJ.lon0;
  return { lat, lon };
}

export class OutsideGridError extends Error {
  constructor(lat: number, lon: number) {
    super(`(${lat}, ${lon}) is outside the Nordic radar grid`);
    this.name = "OutsideGridError";
  }
}

/** lat/lon -> grid cell. Throws OutsideGridError beyond the domain. */
export function cellOf(lat: number, lon: number): Cell {
  const { x, y } = project(lat, lon);
  const col = Math.round((x - X0) / DX);
  const row = Math.round((y - Y0) / DY);
  if (col < 0 || col >= NX || row < 0 || row >= NY) throw new OutsideGridError(lat, lon);
  return { row, col };
}

/** Centre of a grid cell, in projection metres. */
export function cellCentre(row: number, col: number): XY {
  return { x: X0 + col * DX, y: Y0 + row * DY };
}

/**
 * MET rejects coordinates finer than 4 decimals with HTTP 403. Four decimals is
 * ~11 m, far below what a 1 km radar grid can resolve, so nothing is lost.
 */
export function clampCoord(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
