/**
 * The decision layer: three questions, honestly answered.
 *
 *   1. Is it raining here right now?
 *   2. If yes  -> when does it stop?
 *   3. If no   -> will it start, and if we can see the end, how long does it last?
 *
 * Everything comes from one 5-minute analysis covering T+0..T+115 min. Because
 * the horizon is finite, a spell still running at the last frame has an
 * *unknown* end — we say so rather than inventing one.
 *
 * The whole point of this project is being trustworthy about rain when the map
 * makes you guess. Every temptation to round off uncertainty makes it worse.
 */

import { HORIZON_MIN, type Frame, isBlind, probe } from "./radar";
import { NOTICEABLE, bandOf, describeRate } from "./scale";
import { OutsideGridError } from "./grid";

/** A dry gap shorter than this is drizzle flicker, not the end of the rain. */
export const BRIDGE_MIN = 10;

/**
 * Any rain touching the radius counts as rain at that location.
 *
 * The radius is the area the user cares about, so one wet cell inside it is
 * rain there. This also keeps the control monotonic: widening the radius is
 * always *more* sensitive, never less. An earlier rule (">= 25 % of the disc
 * wet") inverted itself — with rain falling on you, widening the radius diluted
 * the fraction and flipped the verdict to dry.
 *
 * A blind frame is neither wet nor dry, and must never be reported as dry.
 */
export function isWet(f: Frame): boolean {
  return !isBlind(f) && f.coverage > 0;
}

export type Spell = {
  startMin: number;
  /** null => still raining at the forecast horizon. The end is UNKNOWN. */
  endMin: number | null;
  peakRate: number;
  meanRate: number;
};

export function isOpenEnded(s: Spell): boolean {
  return s.endMin === null;
}

/** Minutes of rain. For an open-ended spell this is a LOWER BOUND. */
export function durationMin(s: Spell, horizon: number): number {
  return (s.endMin ?? horizon) - s.startMin;
}

export type Confidence = "high" | "moderate" | "low";

export type Verdict = {
  rainingNow: boolean;
  nowRate: number;
  /** The spell you are standing in. */
  current: Spell | null;
  /** The next one to arrive. */
  next: Spell | null;
  horizonMin: number;
  analysisAgeMin: number;
  frames: Frame[];
  /** Fraction of the radius the radar can see, averaged over the series. */
  observed: number;
  /** Part of the circle is outside the mosaic — the answer is drawn from less
   *  than the user asked for, and we say so. */
  partial: boolean;
  /** mm/h at the coordinate itself, as opposed to anywhere in the circle. */
  centreRate: number;
  /**
   * Raining inside the circle, but not on the coordinate.
   *
   * With the any-touch rule a wide radius reports rain when the wet edge is
   * kilometres away. True, and useless on its own — this is what lets the
   * headline say "Rain within 8 km" instead of a bare "Raining."
   */
  edgeOnly: boolean;
  /** Distance to the nearest rain right now, km. null when the circle is dry. */
  nearestKm: number | null;
  radiusKm: number;
};

/** Outside radar coverage. Not dry — unobserved. Never conflate them. */
export function isBlindVerdict(v: Verdict): boolean {
  return v.observed === 0;
}

/**
 * How far out the *predicted* part of the claim sits.
 *
 * Not zero just because it is raining now: "stops in 100 min" is a
 * 100-minute-lead claim and deserves to be labelled as one.
 *
 * Open-ended and no-rain verdicts have no predicted moment at all — what they
 * assert is an *observation* — so they report 0 and read as certain. Their
 * forecast half is hedged in the prose instead.
 */
export function leadMin(v: Verdict): number {
  if (v.rainingNow && v.current) return isOpenEnded(v.current) ? 0 : (v.current.endMin as number);
  if (v.next) return v.next.startMin;
  return 0;
}

/**
 * Observations are certain; only forecast leads decay, and advection nowcasts
 * decay fast. So "it is raining on you" is high confidence even when we cannot
 * see the end — labelling that `low` would be absurd.
 */
export function confidenceOf(v: Verdict): Confidence {
  const lead = leadMin(v);
  if (lead <= 30) return "high";
  // 70, not 60. The boundary is arbitrary either way, but it has to be ONE
  // number: the design fixtures render against 70, so a 60 here would label
  // scenarios differently in the app than in the comps they were reviewed in.
  if (lead <= 70) return "moderate";
  return "low";
}

export function spellsFrom(frames: Frame[]): Spell[] {
  if (frames.length === 0) return [];
  const wet = frames.map(isWet);
  const step = frames.length > 1 ? frames[1].minutes - frames[0].minutes : 5;

  // Bridge short dry gaps so drizzle flicker doesn't split one spell in two.
  const bridged = [...wet];
  const gapFrames = Math.max(1, Math.floor(BRIDGE_MIN / step));
  let i = 0;
  while (i < bridged.length) {
    if (bridged[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < bridged.length && !bridged[j]) j++;
    if (i > 0 && j < bridged.length && j - i <= gapFrames) {
      for (let k = i; k < j; k++) bridged[k] = true;
    }
    i = j;
  }

  const out: Spell[] = [];
  i = 0;
  while (i < bridged.length) {
    if (!bridged[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < bridged.length && bridged[j]) j++;
    const run = frames.slice(i, j);
    const means = run.map((f) => f.meanRate).filter((m) => m > 0);
    out.push({
      startMin: run[0].minutes,
      // j === frames.length means the rain outlives our forecast.
      endMin: j >= bridged.length ? null : frames[j].minutes,
      peakRate: Math.max(...run.map((f) => f.maxRate), 0),
      meanRate: means.length ? means.reduce((a, b) => a + b, 0) / means.length : 0,
    });
    i = j;
  }
  return out;
}

export function verdictFrom(
  frames: Frame[],
  analysisAgeMin: number,
  radiusKm = 3,
  threshold = NOTICEABLE,
): Verdict {
  const spells = spellsFrom(frames);
  const current = spells.length && spells[0].startMin === 0 ? spells[0] : null;
  const next = spells.find((s) => s.startMin > 0) ?? null;
  const rainingNow = current !== null;
  // Averaged rather than sampled from frame 0. The coverage mask is static
  // within one analysis, so this is equivalent in practice and robust if a
  // radar drops out mid-series.
  const observed = frames.length
    ? frames.reduce((s, f) => s + f.observed, 0) / frames.length
    : 0;
  const f0 = frames[0];
  const centreRate = f0?.centreRate ?? 0;
  return {
    rainingNow,
    nowRate: rainingNow ? (f0?.maxRate ?? 0) : 0,
    current,
    next,
    horizonMin: frames.length ? frames[frames.length - 1].minutes : HORIZON_MIN,
    analysisAgeMin,
    frames,
    observed,
    partial: observed > 0 && observed < 1,
    centreRate,
    edgeOnly: rainingNow && centreRate < threshold,
    nearestKm: f0?.nearestKm ?? null,
    radiusKm,
  };
}

export type VerdictOptions = {
  radiusKm?: number;
  threshold?: number;
  signal?: AbortSignal;
};

/** Answer the three questions for one location. */
export async function verdict(
  lat: number,
  lon: number,
  opts: VerdictOptions = {},
): Promise<Verdict> {
  const threshold = opts.threshold ?? NOTICEABLE;
  let p: Awaited<ReturnType<typeof probe>>;
  try {
    p = await probe(lat, lon, { ...opts, threshold });
  } catch (e) {
    if (e instanceof OutsideGridError) {
      // Outside the Nordic grid entirely. That is a coverage answer, not an
      // error — the caller asked a fair question about a real place.
      return {
        rainingNow: false,
        nowRate: 0,
        current: null,
        next: null,
        horizonMin: HORIZON_MIN,
        analysisAgeMin: 0,
        frames: [],
        observed: 0,
        partial: false,
        centreRate: 0,
        edgeOnly: false,
        nearestKm: null,
        radiusKm: opts.radiusKm ?? 3,
      };
    }
    throw e;
  }
  const ageMin = (Date.now() - p.analysis.time.getTime()) / 60000;
  return verdictFrom(p.frames, ageMin, p.radiusKm, threshold);
}

/** Plain-language answer. The UI should use the structured Verdict; this is for
 *  tests, debugging and the CLI. */
export function describe(v: Verdict): string {
  const lines: string[] = [];

  if (isBlindVerdict(v)) {
    // Not dry. Unobserved. Saying "dry" here would be the most confident wrong
    // answer this program is capable of producing.
    lines.push("No radar coverage here — we cannot see this place.");
    lines.push(
      "That is not the same as dry: we have no observation at all, so byge makes no claim either way.",
    );
    return lines.join("\n");
  }

  if (v.rainingNow && v.current) {
    const s = v.current;
    if (v.edgeOnly) {
      // A bare "Raining." would be true and misleading: the wet cell is inside
      // the circle but not overhead.
      //
      // Don't call it "the edge of your circle" either — that is only true when
      // the rain is actually near the rim. At 2 km inside a 20 km circle it is
      // the same species of true-but-misleading sentence we are trying to
      // avoid. State the distance, which is right at every radius.
      const km = v.nearestKm === null ? v.radiusKm : Math.round(v.nearestKm);
      lines.push(`Rain within ${km} km — not on you yet.`);
      lines.push(`Nothing is falling at your coordinate; the nearest cell is ${km} km off.`);
    } else {
      lines.push(`Yes — raining now: ${describeRate(v.nowRate)}.`);
    }
    if (isOpenEnded(s)) {
      lines.push(`Still raining ${v.horizonMin} min from now — no end within the forecast.`);
    } else {
      lines.push(`Stops in about ${s.endMin} min.`);
      if (v.next) {
        // Dropping the second spell turns "clears at 6, more at 6:30" into
        // "clears at 6" — true, and the wrong thing to plan around.
        const n = v.next;
        const tail = isOpenEnded(n)
          ? "and does not clear again within the forecast"
          : `lasting about ${durationMin(n, v.horizonMin)} min`;
        lines.push(`Then more from about ${n.startMin} min — ${tail}.`);
      }
    }
  } else if (!v.next) {
    // "Dry for the next 115 min" is really two claims of very different
    // strength. The near term is observed; the tail is extrapolation.
    lines.push("No — dry now, and nothing approaching.");
    lines.push(
      `The next ~30 min are a confident call; radar sees no rain through ${v.horizonMin} min, but that far out is indicative only.`,
    );
  } else {
    const s = v.next;
    lines.push(
      `No — dry now, but rain arrives in about ${s.startMin} min (${bandOf(s.peakRate).label}).`,
    );
    if (isOpenEnded(s)) {
      lines.push(
        `It is still raining when the forecast runs out, so it lasts at least ${durationMin(s, v.horizonMin)} min — the end isn't visible yet.`,
      );
    } else {
      lines.push(
        `It should last about ${durationMin(s, v.horizonMin)} min, clearing around ${s.endMin} min from now.`,
      );
    }
  }

  if (v.observed < 1) {
    lines.push(
      `Radar sees only ${Math.round(v.observed * 100)}% of your area — the rest is outside coverage and not included either way.`,
    );
  }
  lines.push(
    `Confidence ${confidenceOf(v)} · radar ${Math.round(v.analysisAgeMin)} min old.`,
  );
  return lines.join("\n");
}
