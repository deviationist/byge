import { expect, it, describe as suite } from "vitest";
import {
  BRIDGE_MIN,
  confidenceOf,
  describe,
  durationMin,
  isBlindVerdict,
  isOpenEnded,
  isWet,
  leadMin,
  spellsFrom,
  verdictFrom,
} from "./forecast";
import { NFRAMES, STEP_S } from "./grid";
import type { Frame } from "./radar";
import { BANDS, bandLabel, bandOf, legend, NOTICEABLE } from "./scale";

/**
 * Ported from the Python spike's tests/test_forecast.py. These guard the
 * project's central promise: byge exists to be *honest* about rain when the map
 * makes you guess, and most of what follows tests that honesty mechanically.
 *
 * If you find yourself adding a fallback that turns "unknown" into a number,
 * stop.
 */

const WET = 1;
const DRY = 0;

type FrameOpts = {
  rate?: number;
  observed?: number;
  /** mm/h at the coordinate itself; defaults to the disc rate (rain overhead). */
  centre?: number[];
  nearestKm?: number | null;
};

/** Synthetic frame series. `coverages` is one value per 5-minute step. */
function frames(coverages: number[], o: FrameOpts = {}): Frame[] {
  const rate = o.rate ?? 2.0;
  const observed = o.observed ?? 1;
  const t0 = Date.UTC(2026, 7, 1, 12, 0, 0);
  return coverages.map((cov, i) => ({
    time: new Date(t0 + i * STEP_S * 1000),
    minutes: i * 5,
    maxRate: cov > 0 ? rate : 0,
    meanRate: cov > 0 ? rate : 0,
    coverage: cov,
    observed,
    centreRate: o.centre ? o.centre[i] : cov > 0 ? rate : 0,
    nearestKm: o.nearestKm !== undefined ? o.nearestKm : cov > 0 ? 0 : null,
  }));
}

function v(coverages: number[], o: FrameOpts = {}, radiusKm = 3) {
  return verdictFrom(frames(coverages, o), 3, radiusKm);
}

const rep = (n: number, val: number) => Array.from({ length: n }, () => val);

// ---------------------------------------------------------------------------
// The honesty invariants
// ---------------------------------------------------------------------------

suite("open-ended spells", () => {
  it("a spell running at the horizon has no end", () => {
    // The single most important assertion in the suite. If rain is still
    // falling at the last frame we do not know when it stops. Substituting the
    // horizon would turn "at least 40 min" into "40 min".
    const x = v(rep(NFRAMES, WET));
    expect(x.rainingNow).toBe(true);
    expect(x.current!.endMin).toBeNull();
    expect(isOpenEnded(x.current!)).toBe(true);
  });

  it("its duration is a lower bound, not a measurement", () => {
    const x = v([...rep(4, DRY), ...rep(NFRAMES - 4, WET)]);
    const s = x.next!;
    expect(isOpenEnded(s)).toBe(true);
    expect(durationMin(s, x.horizonMin)).toBe(x.horizonMin - s.startMin);
  });

  it("describe() says 'at least' and admits the end isn't visible", () => {
    const text = describe(v([...rep(4, DRY), ...rep(NFRAMES - 4, WET)]));
    expect(text).toContain("at least");
    expect(text).toMatch(/isn't visible|not visible/);
  });

  it("describe() never claims a duration it cannot see", () => {
    // Guards against a regression where the horizon leaks out as a fact.
    const text = describe(v(rep(NFRAMES, WET)));
    expect(text).not.toContain("Stops in about");
    expect(text.toLowerCase()).toContain("no end within the forecast");
  });
});

suite("spell boundaries", () => {
  it("a closed spell reports a real end", () => {
    const x = v([...rep(6, WET), ...rep(NFRAMES - 6, DRY)]);
    expect(x.current!.endMin).toBe(30);
    expect(isOpenEnded(x.current!)).toBe(false);
  });

  it("endMin is the first OBSERVED dry frame, not the last wet one", () => {
    // 21 wet frames cover minutes 0-100, each standing for the 5 minutes that
    // follow, so the rain occupies 105 minutes and clears at T+105.
    // Conservative in the honest direction — we never claim it stopped earlier
    // than we saw it stop.
    const x = v([...rep(21, WET), ...rep(3, DRY)]);
    expect(x.current!.endMin).toBe(105);
    expect(durationMin(x.current!, x.horizonMin)).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Confidence tracks the claim, not the clock
// ---------------------------------------------------------------------------

suite("confidence", () => {
  it("keys off the predicted end, not the fact that it is raining", () => {
    // "Raining now, stops in 105 min" is a 105-minute claim.
    const x = v([...rep(21, WET), ...rep(3, DRY)]);
    expect(x.rainingNow).toBe(true);
    expect(leadMin(x)).toBe(105);
    expect(confidenceOf(x)).toBe("low");
  });

  it("an open-ended spell is HIGH — it is an observation", () => {
    // Only the end is unknown, and that is hedged in the prose rather than by
    // discrediting the whole verdict. Labelling this `low` would be absurd.
    const x = v(rep(NFRAMES, WET));
    expect(isOpenEnded(x.current!)).toBe(true);
    expect(leadMin(x)).toBe(0);
    expect(confidenceOf(x)).toBe("high");
  });

  it("'nothing approaching' is HIGH — the clear field is observed", () => {
    const x = v(rep(NFRAMES, DRY));
    expect(confidenceOf(x)).toBe("high");
    // ...but the far end of "nothing for 115 min" is still hedged in prose.
    expect(describe(x)).toContain("indicative only");
  });

  it("a short spell while raining is high", () => {
    const x = v([...rep(4, WET), ...rep(NFRAMES - 4, DRY)]);
    expect(leadMin(x)).toBe(20);
    expect(confidenceOf(x)).toBe("high");
  });

  it.each([
    [4, "high"],
    [10, "moderate"],
    [18, "low"],
  ])("arrival at frame %i reads as %s", (lead, expected) => {
    const x = v([...rep(lead, DRY), ...rep(NFRAMES - lead, WET)]);
    expect(confidenceOf(x)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Spell detection
// ---------------------------------------------------------------------------

suite("spell detection", () => {
  it("all dry yields no spells", () => {
    const x = v(rep(NFRAMES, DRY));
    expect(x.rainingNow).toBe(false);
    expect(x.current).toBeNull();
    expect(x.next).toBeNull();
  });

  it("bridges a short dry gap — drizzle flicker is not the end of the rain", () => {
    // Without bridging the app announces "stops in 15 min" and then it rains.
    const x = v([...rep(3, WET), DRY, ...rep(4, WET), ...rep(NFRAMES - 8, DRY)]);
    expect(x.rainingNow).toBe(true);
    expect(x.current!.endMin).toBe(40);
    expect(x.next).toBeNull();
  });

  it("keeps a genuine break — the second band is real information", () => {
    const x = v([...rep(3, WET), ...rep(6, DRY), ...rep(4, WET), ...rep(NFRAMES - 13, DRY)]);
    expect(x.current!.endMin).toBe(15);
    expect(x.next!.startMin).toBe(45);
  });

  it(`bridges gaps up to ${BRIDGE_MIN} min and no further`, () => {
    const two = v([...rep(3, WET), DRY, DRY, ...rep(NFRAMES - 5, WET)]);
    expect(two.current!.endMin).toBeNull(); // one continuous spell
    const three = v([...rep(3, WET), DRY, DRY, DRY, ...rep(NFRAMES - 6, WET)]);
    expect(three.current!.endMin).toBe(15); // split
    expect(three.next!.startMin).toBe(30);
  });

  it("dry now then rain populates next, not current", () => {
    const x = v([...rep(6, DRY), ...rep(4, WET), ...rep(NFRAMES - 10, DRY)]);
    expect(x.rainingNow).toBe(false);
    expect(x.current).toBeNull();
    expect(x.next!.startMin).toBe(30);
    expect(x.next!.endMin).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// The radius rule
// ---------------------------------------------------------------------------

suite("any rain touching the radius counts", () => {
  it("2 % of the disc wet is rain at that location", () => {
    // The radius is the area the user cares about. The earlier rule
    // (">= 25 % of the disc") inverted itself: with rain falling on you,
    // widening the radius diluted the fraction and flipped the verdict to dry.
    expect(v(rep(NFRAMES, 0.02)).rainingNow).toBe(true);
  });

  it("widening the radius never turns rain into dry", () => {
    expect(v(rep(NFRAMES, 0.02)).rainingNow).toBe(true);
    expect(v(rep(NFRAMES, 0.9)).rainingNow).toBe(true);
  });

  it("zero coverage is dry", () => {
    expect(v(rep(NFRAMES, 0)).rainingNow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coverage — unobserved is not dry
// ---------------------------------------------------------------------------

suite("radar coverage", () => {
  it("never reports an unobserved location as dry", () => {
    // The most confident wrong answer this program could give. A location
    // outside coverage has no observation; saying "dry" claims we looked and
    // saw nothing falling, when in fact we cannot look at all.
    const x = v(rep(NFRAMES, DRY), { observed: 0 });
    expect(isBlindVerdict(x)).toBe(true);
    const text = describe(x).toLowerCase();
    expect(text).toContain("no radar coverage");
    expect(text).toContain("not the same as dry");
    expect(text).not.toContain("nothing approaching");
  });

  it("blind frames are neither wet nor dry", () => {
    const fs = frames(rep(NFRAMES, WET), { observed: 0 });
    expect(fs.some(isWet)).toBe(false);
    expect(spellsFrom(fs)).toEqual([]);
  });

  it("discloses partial coverage rather than silently shrinking the answer", () => {
    const x = v(rep(NFRAMES, DRY), { observed: 0.6 });
    expect(isBlindVerdict(x)).toBe(false);
    expect(describe(x)).toContain("60%");
  });
});

// ---------------------------------------------------------------------------
// Second spell — rain that stops and comes back
// ---------------------------------------------------------------------------

suite("second spell", () => {
  it("is reported when it is already raining", () => {
    // "Clears at 6" is true and the wrong thing to plan around if more follows.
    const x = v([...rep(4, WET), ...rep(6, DRY), ...rep(6, WET), ...rep(8, DRY)]);
    expect(x.current!.endMin).toBe(20);
    expect(x.next!.startMin).toBe(50);
    const text = describe(x);
    expect(text).toContain("Stops in about 20 min");
    expect(text).toContain("Then more from about 50 min");
  });

  it("is flagged when it too runs past the horizon", () => {
    const x = v([...rep(4, WET), ...rep(6, DRY), ...rep(14, WET)]);
    expect(isOpenEnded(x.next!)).toBe(true);
    expect(describe(x)).toContain("does not clear again");
  });

  it("adds no sentence when there is no second spell", () => {
    expect(describe(v([...rep(4, WET), ...rep(20, DRY)]))).not.toContain("Then more");
  });
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

suite("scale", () => {
  it("bands ascend", () => {
    const floors = BANDS.map((b) => b.floor);
    expect([...floors].sort((a, b) => a - b)).toEqual(floors);
  });

  it.each([
    [0.0, "dry"],
    [0.04, "trace"],
    [0.1, "drizzle"],
    [0.5, "light rain"],
    [3.0, "moderate rain"],
    [10.0, "heavy rain"],
    [50.0, "torrential"],
  ])("%f mm/h reads as %s", (rate, label) => {
    expect(bandLabel(bandOf(rate))).toBe(label);
  });

  it("band boundaries are inclusive at the floor", () => {
    for (const b of BANDS.slice(1)) expect(bandOf(b.floor).index).toBe(b.index);
  });

  it("'noticeable' is band 3 — bands 1-2 are moisture nobody calls rain", () => {
    expect(NOTICEABLE).toBe(BANDS[3].floor);
    expect(bandLabel(bandOf(NOTICEABLE))).toBe("light rain");
  });

  it("the legend covers every band except dry, with an open top", () => {
    const rows = legend();
    expect(rows).toHaveLength(BANDS.length - 1);
    expect(rows[rows.length - 1].to).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reconciled with the design system's foundation.js
// ---------------------------------------------------------------------------

suite("confidence boundary", () => {
  it("moderate runs to 70 minutes, not 60", () => {
    // Arbitrary either way, but it must be ONE number: the design fixtures
    // render against 70, so a 60 here would label scenarios differently in the
    // app than in the comps they were reviewed in.
    const at70 = v([...rep(14, DRY), ...rep(NFRAMES - 14, WET)]);
    expect(leadMin(at70)).toBe(70);
    expect(confidenceOf(at70)).toBe("moderate");

    const at75 = v([...rep(15, DRY), ...rep(NFRAMES - 15, WET)]);
    expect(leadMin(at75)).toBe(75);
    expect(confidenceOf(at75)).toBe("low");
  });
});

suite("rain inside the circle but not on you", () => {
  const wetEdge = () => v(rep(NFRAMES, 0.3), { centre: rep(NFRAMES, 0.01), nearestKm: 8 }, 15);

  it("is still raining — the any-touch rule is unchanged", () => {
    expect(wetEdge().rainingNow).toBe(true);
  });

  it("is flagged as edge-only when the coordinate itself is dry", () => {
    const x = wetEdge();
    expect(x.edgeOnly).toBe(true);
    expect(x.centreRate).toBeLessThan(0.195);
    expect(x.nearestKm).toBe(8);
  });

  it("says where the rain is instead of a bare 'Raining'", () => {
    // "Raining." would be true and misleading with a 15 km radius: the wet
    // cell is at the rim, not overhead.
    const text = describe(wetEdge());
    expect(text).toContain("Rain within 8 km");
    expect(text).toContain("not on you yet");
    // Not "the edge of your circle" — 8 km into a 15 km circle is not the edge,
    // and the phrase would be wrong at most radii.
    expect(text).not.toContain("edge of your");
    expect(text).not.toMatch(/^Yes — raining now/m);
  });

  it("is NOT edge-only when the rain is actually overhead", () => {
    const x = v(rep(NFRAMES, 0.9), {}, 15);
    expect(x.rainingNow).toBe(true);
    expect(x.edgeOnly).toBe(false);
    expect(describe(x)).toContain("raining now");
  });
});

suite("partial coverage", () => {
  it("averages observed across the series rather than sampling frame 0", () => {
    const fs = frames(rep(NFRAMES, DRY));
    fs[0].observed = 1;
    for (let i = 1; i < fs.length; i++) fs[i].observed = 0.5;
    const x = verdictFrom(fs, 3);
    expect(x.observed).toBeGreaterThan(0.5);
    expect(x.observed).toBeLessThan(1);
    expect(x.partial).toBe(true);
  });

  it("full coverage is not partial", () => {
    expect(v(rep(NFRAMES, DRY)).partial).toBe(false);
  });

  it("blind is not partial — it is a different claim entirely", () => {
    const x = v(rep(NFRAMES, DRY), { observed: 0 });
    expect(x.partial).toBe(false);
    expect(isBlindVerdict(x)).toBe(true);
  });
});
