import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Verdict, isBlindVerdict } from "../lib/forecast";
import { NFRAMES } from "../lib/grid";
import { CoverageNotice, coverageFormOf, observedPercent } from "./CoverageNotice";

function verdictLike(over: Partial<Verdict>): Verdict {
  const frames = Array.from({ length: NFRAMES }, (_, i) => ({
    time: new Date(0),
    minutes: i * 5,
    maxRate: 0,
    meanRate: 0,
    coverage: 0,
    observed: 1,
    centreRate: 0,
    nearestKm: null,
  }));
  return {
    rainingNow: false,
    nowRate: 0,
    current: null,
    next: null,
    horizonMin: 115,
    analysisAgeMin: 3,
    frames,
    observed: 1,
    partial: false,
    centreRate: 0,
    edgeOnly: false,
    nearestKm: null,
    radiusKm: 3,
    ...over,
  };
}

describe("coverageFormOf", () => {
  it("agrees with isBlindVerdict exactly", () => {
    // Two definitions of "blind" is one too many. If the lib ever moves off
    // `observed === 0`, this fails rather than letting the notice drift.
    for (const observed of [0, 0.0001, 0.5, 0.9999, 1]) {
      const v = verdictLike({ observed });
      expect(coverageFormOf(observed) === "blind").toBe(isBlindVerdict(v));
    }
  });

  it("treats a barely-clipped location as partial, not blind", () => {
    expect(coverageFormOf(0.02)).toBe("partial");
  });

  it("is silent only at full coverage", () => {
    expect(coverageFormOf(1)).toBe("full");
  });
});

describe("observedPercent", () => {
  it("rounds to whole percent", () => {
    expect(observedPercent(0.604)).toBe(60);
  });

  it("never rounds down to 0% — that would read as blind", () => {
    // A location the radar barely reaches still HAS a verdict. Printing "0%"
    // in the partial notice would claim no observation at all.
    expect(observedPercent(0.004)).toBe(1);
  });

  it("never rounds up to 100% — that would retract the notice", () => {
    expect(observedPercent(0.999)).toBe(99);
  });
});

describe("CoverageNotice — blind", () => {
  it("says we cannot see, not that it is dry", () => {
    const { container } = render(<CoverageNotice observed={0} theme="light" />);
    expect(container.textContent).toMatch(/no radar coverage/i);
    expect(container.textContent).toMatch(/we cannot see this place/i);
  });

  it("states outright that this is NOT the same as dry", () => {
    // The single most important sentence in the component. Without it, a reader
    // fills the silence with "so it must be fine" — which is precisely the
    // wrong answer this project exists to avoid.
    const { container } = render(<CoverageNotice observed={0} theme="light" />);
    expect(container.textContent).toMatch(/not the same as dry/i);
    expect(container.textContent).toMatch(/no claim either way/i);
  });

  it("never asserts dryness or a rain state", () => {
    const { container } = render(<CoverageNotice observed={0} theme="dark" />);
    expect(container.textContent).not.toMatch(/it is dry|no rain|nothing approaching/i);
  });

  it("does not show a percentage — there is no fraction to report", () => {
    const { container } = render(<CoverageNotice observed={0} theme="light" />);
    expect(container.textContent).not.toContain("%");
  });

  it("carries the hatched swatch, so the shape says it too", () => {
    const { container } = render(<CoverageNotice observed={0} theme="light" />);
    expect(container.innerHTML).toContain("repeating-linear-gradient");
  });
});

describe("CoverageNotice — partial", () => {
  it("reports how much of the area is seen", () => {
    const { container } = render(<CoverageNotice observed={0.6} theme="light" />);
    expect(container.textContent).toMatch(/radar sees only 60% of your area/i);
  });

  it("says the unseen part counts neither way", () => {
    const { container } = render(<CoverageNotice observed={0.6} theme="light" />);
    expect(container.textContent).toMatch(/outside coverage and not included either way/i);
  });

  it("is not the blind copy — a partial verdict is still a verdict", () => {
    const { container } = render(<CoverageNotice observed={0.6} theme="light" />);
    expect(container.textContent).not.toMatch(/we cannot see this place/i);
    expect(container.textContent).not.toMatch(/no claim either way/i);
  });

  it("renders in both themes without throwing", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(() => render(<CoverageNotice observed={0.35} theme={theme} />)).not.toThrow();
    }
  });
});

describe("CoverageNotice — full coverage", () => {
  it("renders nothing when the radar sees the whole radius", () => {
    const { container } = render(<CoverageNotice observed={1} theme="light" />);
    expect(container.firstElementChild).toBeNull();
  });
});
