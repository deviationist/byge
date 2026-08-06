/**
 * Reading the radar grid for one point + radius.
 *
 * Everything is an OPeNDAP subset around the location — a full grid is 347 MB,
 * a 3 km disc across all 24 frames is 8.3 KB. Fetch time is dominated by server
 * latency (~1.3 s) rather than transfer, so radius costs bytes, not seconds.
 */

import { cellOf, HORIZON_MIN, NFRAMES, STEP_S } from "./grid";
import {
  type Analysis,
  clampWindow,
  FILL_THRESHOLD,
  fetchVars,
  frameTimes,
  latestAnalysis,
} from "./opendap";

export type Frame = {
  time: Date;
  /** Minutes from the analysis time. 0, 5, 10 … 115. */
  minutes: number;
  /** mm/h, strongest observed cell within the radius. */
  maxRate: number;
  /** mm/h, averaged over wet cells only. */
  meanRate: number;
  /** Fraction of the OBSERVED disc at or above the threshold. */
  coverage: number;
  /** Fraction of the disc the radar can actually see. */
  observed: number;
  /**
   * mm/h at the single cell containing the coordinate.
   *
   * Tracked separately from the disc so we can tell "raining on you" from
   * "raining somewhere inside your circle". With the any-touch rule a 15 km
   * radius reports rain when the wet edge is 12 km away, which is true and
   * useless without this distinction.
   */
  centreRate: number;
  /** Distance to the nearest wet cell, km. null when nothing in the disc is wet. */
  nearestKm: number | null;
};

/** No radar data here at all — we cannot say wet, and we cannot say dry. */
export function isBlind(f: Frame): boolean {
  return f.observed === 0;
}

export type Probe = {
  lat: number;
  lon: number;
  radiusKm: number;
  threshold: number;
  analysis: Analysis;
  frames: Frame[];
  /**
   * The raw cells, kept only when `keepGrid` was asked for.
   *
   * Everything else here is a REDUCTION of this — max, mean, coverage, nearest
   * — because a verdict is a sentence and a sentence needs numbers, not a
   * field. The radar map is the one screen that needs the field itself: it
   * exists to show WHY the sentence says what it says, and a picture of the
   * band is the only thing that can do that.
   *
   * Off by default, and deliberately so. The cube is already fetched and then
   * discarded on every verdict; holding it costs memory per saved place for a
   * screen most sessions never open.
   */
  grid?: RadarGrid;
};

/**
 * A window of radar cells over time, in grid space.
 *
 * Rows and columns are indices into MET's Lambert Conformal Conic grid, NOT
 * degrees — `cellCentre` in lib/grid.ts turns one into a projected metre
 * coordinate, and `unproject` turns that into lat/lon. Keeping them as indices
 * here means the layer that draws them decides how to project, and this stays
 * the shape MET actually sent.
 */
export type RadarGrid = {
  /** Top-left cell of the window. */
  row0: number;
  col0: number;
  width: number;
  height: number;
  /**
   * `values[t * width * height + i * width + j]` — mm/h, or >= FILL_THRESHOLD
   * where the mosaic cannot see. The fill value is left IN rather than mapped
   * to zero: "no radar here" and "no rain here" are the distinction this whole
   * app turns on, and flattening it in the data would make the map draw dry
   * ground over the ocean.
   */
  values: Float64Array | number[];
};

export type ProbeOptions = {
  radiusKm?: number;
  threshold?: number;
  /** Keep the raw cells as well as the summary. See `Probe.grid`. */
  keepGrid?: boolean;
  analysis?: Analysis;
  signal?: AbortSignal;
};

/**
 * Build the frame series for a location.
 *
 * `_FillValue` cells are places the mosaic cannot see. They are NOT dry.
 * Counting them in the denominator would dilute real rain, and counting a
 * fully-blind disc as 0 % coverage would report "dry" for a location we have no
 * observation of at all — the exact failure this project exists to avoid.
 */
export async function probe(lat: number, lon: number, opts: ProbeOptions = {}): Promise<Probe> {
  const radiusKm = opts.radiusKm ?? 3;
  const threshold = opts.threshold ?? 0.195;
  const analysis = opts.analysis ?? (await latestAnalysis(opts.signal));

  const { row, col } = cellOf(lat, lon);
  const r = Math.max(1, Math.round(radiusKm)); // 1 km grid => radius in cells
  const { r0, r1, c0, c1 } = clampWindow(row, col, r);

  const vars = await fetchVars(
    analysis.base,
    `lwe_precipitation_rate[0:1:${NFRAMES - 1}][${r0}:1:${r1}][${c0}:1:${c1}]`,
    opts.signal,
  );
  const cube = vars.get("lwe_precipitation_rate");
  if (!cube) throw new Error("lwe_precipitation_rate missing from response");

  const h = r1 - r0 + 1;
  const w = c1 - c0 + 1;
  const times = frameTimes(analysis);

  // Precompute the disc mask once; it is the same for every frame.
  const inDisc: boolean[] = [];
  let discCells = 0;
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const dy = r0 + i - row;
      const dx = c0 + j - col;
      const hit = dy * dy + dx * dx <= r * r;
      inDisc.push(hit);
      if (hit) discCells++;
    }
  }

  const centreIdx = (row - r0) * w + (col - c0);

  const frames: Frame[] = [];
  for (let t = 0; t < NFRAMES; t++) {
    const base = t * h * w;
    let seen = 0;
    let wet = 0;
    let max = 0;
    let wetSum = 0;
    let nearestSq = Number.POSITIVE_INFINITY;
    for (let k = 0; k < h * w; k++) {
      if (!inDisc[k]) continue;
      const v = cube.values[base + k];
      if (!(v < FILL_THRESHOLD)) continue; // NaN-safe: excludes fill and NaN
      seen++;
      if (v > max) max = v;
      if (v >= threshold) {
        wet++;
        wetSum += v;
        const dy = r0 + Math.floor(k / w) - row;
        const dx = c0 + (k % w) - col;
        const d2 = dy * dy + dx * dx;
        if (d2 < nearestSq) nearestSq = d2;
      }
    }
    const centre = cube.values[base + centreIdx];
    frames.push({
      time: times[t],
      minutes: (t * STEP_S) / 60,
      maxRate: seen ? max : 0,
      meanRate: wet ? wetSum / wet : 0,
      coverage: seen ? wet / seen : 0,
      observed: discCells ? seen / discCells : 0,
      // 1 km grid, so cell distance is km directly.
      centreRate: centre < FILL_THRESHOLD ? centre : 0,
      nearestKm: Number.isFinite(nearestSq) ? Math.sqrt(nearestSq) : null,
    });
  }

  return {
    lat,
    lon,
    radiusKm,
    threshold,
    analysis,
    frames,
    grid: opts.keepGrid
      ? { row0: r0, col0: c0, width: w, height: h, values: cube.values }
      : undefined,
  };
}

export { HORIZON_MIN };
