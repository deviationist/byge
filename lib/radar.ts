/**
 * Reading the radar grid for one point + radius.
 *
 * Everything is an OPeNDAP subset around the location — a full grid is 347 MB,
 * a 3 km disc across all 24 frames is 8.3 KB. Fetch time is dominated by server
 * latency (~1.3 s) rather than transfer, so radius costs bytes, not seconds.
 */

import { HORIZON_MIN, NFRAMES, STEP_S, cellOf } from "./grid";
import {
  type Analysis,
  FILL_THRESHOLD,
  clampWindow,
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
};

export type ProbeOptions = {
  radiusKm?: number;
  threshold?: number;
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

  const frames: Frame[] = [];
  for (let t = 0; t < NFRAMES; t++) {
    const base = t * h * w;
    let seen = 0;
    let wet = 0;
    let max = 0;
    let wetSum = 0;
    for (let k = 0; k < h * w; k++) {
      if (!inDisc[k]) continue;
      const v = cube.values[base + k];
      if (!(v < FILL_THRESHOLD)) continue; // NaN-safe: excludes fill and NaN
      seen++;
      if (v > max) max = v;
      if (v >= threshold) {
        wet++;
        wetSum += v;
      }
    }
    frames.push({
      time: times[t],
      minutes: (t * STEP_S) / 60,
      maxRate: seen ? max : 0,
      meanRate: wet ? wetSum / wet : 0,
      coverage: seen ? wet / seen : 0,
      observed: discCells ? seen / discCells : 0,
    });
  }

  return { lat, lon, radiusKm, threshold, analysis, frames };
}

export { HORIZON_MIN };
