import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NFRAMES } from "../lib/grid";
import type { Verdict } from "../lib/forecast";
import { BANDS, NOTICEABLE } from "../lib/scale";
import { Swatch, swatchModeOf, swatchRateOf } from "./Swatch";

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

describe("swatchModeOf", () => {
  it("blind wins over everything — unobserved is not dry", () => {
    // The ordering here is the point: a blind location has no rain data to
    // classify, and falling through to "dry" would state the thing we most
    // need not to state.
    const v = verdictLike({ observed: 0, rainingNow: false });
    expect(swatchModeOf(v)).toBe("blind");
  });

  it("raining now is filled", () => {
    expect(swatchModeOf(verdictLike({ rainingNow: true }))).toBe("now");
  });

  it("rain later in the series is an outline", () => {
    const v = verdictLike({});
    v.frames[10].maxRate = 2.4;
    expect(swatchModeOf(v)).toBe("later");
  });

  it("sub-threshold moisture is dry, not 'later'", () => {
    // Bands 1-2 are radar seeing damp air nobody would call rain. Showing an
    // outline for that would promise weather that never arrives.
    const v = verdictLike({});
    v.frames[10].maxRate = NOTICEABLE - 0.01;
    expect(swatchModeOf(v)).toBe("dry");
  });

  it("a clear series is dry", () => {
    expect(swatchModeOf(verdictLike({}))).toBe("dry");
  });
});

describe("swatchRateOf", () => {
  it("uses the current rate while raining", () => {
    expect(swatchRateOf(verdictLike({ rainingNow: true, nowRate: 4.2 }))).toBe(4.2);
  });

  it("uses the peak of the series when rain is still coming", () => {
    // The outline should be coloured by how bad it gets, not by the first
    // drizzle at its leading edge.
    const v = verdictLike({});
    v.frames[8].maxRate = 0.5;
    v.frames[12].maxRate = 9.1;
    expect(swatchRateOf(v)).toBe(9.1);
  });
});

describe("Swatch rendering", () => {
  const styleOf = (el: HTMLElement | null) => (el as HTMLElement).style;

  it("fills with the band colour when raining", () => {
    const { container } = render(<Swatch mode="now" rate={3.4} theme="light" />);
    const s = styleOf(container.firstElementChild as HTMLElement);
    expect(s.backgroundColor).toBe("rgb(0, 128, 255)"); // band 4 light
  });

  it("uses the dark ramp in dark mode", () => {
    const { container } = render(<Swatch mode="now" rate={3.4} theme="dark" />);
    const s = styleOf(container.firstElementChild as HTMLElement);
    expect(s.backgroundColor).toBe("rgb(85, 174, 245)"); // band 4 dark
  });

  it("draws `later` as a ring in the band colour, not a fill", () => {
    // react-native-web expands border shorthands to longhands and normalises
    // `transparent` to rgba(0,0,0,0), so assert on what it actually emits.
    const { container } = render(<Swatch mode="later" rate={3.4} theme="light" />);
    const s = styleOf(container.firstElementChild as HTMLElement);
    expect(s.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(s.borderTopColor).toBe("rgb(0, 128, 255)");
  });

  it("hatches when unobserved — the shape carries it, not the colour", () => {
    const { container } = render(<Swatch mode="blind" theme="light" />);
    const s = styleOf(container.firstElementChild as HTMLElement);
    expect(s.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("does not hatch any other mode", () => {
    for (const mode of ["now", "later", "dry"] as const) {
      const { container } = render(<Swatch mode={mode} rate={1} theme="light" />);
      expect(styleOf(container.firstElementChild as HTMLElement).backgroundImage).toBe("");
    }
  });

  it("scales the ring with the swatch so it stays visible when small", () => {
    const { container: small } = render(<Swatch mode="later" rate={1} size={11} theme="light" />);
    const { container: big } = render(<Swatch mode="later" rate={1} size={24} theme="light" />);
    const w = (c: Element) =>
      Number.parseFloat((c.firstElementChild as HTMLElement).style.borderTopWidth);
    expect(w(big)).toBeGreaterThan(w(small));
    expect(w(small)).toBeGreaterThanOrEqual(2);
  });

  it("labels every mode for screen readers", () => {
    for (const mode of ["now", "later", "dry", "blind"] as const) {
      const { container } = render(<Swatch mode={mode} rate={1} theme="light" />);
      const el = container.firstElementChild as HTMLElement;
      expect(el.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("distinguishes 'not observed' from 'dry' in its label", () => {
    // Same requirement as the hatch, for anyone not seeing the shape.
    const { container: blind } = render(<Swatch mode="blind" theme="light" />);
    const { container: dry } = render(<Swatch mode="dry" theme="light" />);
    const label = (c: Element) => c.firstElementChild!.getAttribute("aria-label");
    expect(label(blind)).not.toBe(label(dry));
    expect(label(blind)).toMatch(/not observed/i);
  });

  it("renders every band without throwing", () => {
    for (const b of BANDS) {
      expect(() => render(<Swatch mode="now" rate={b.floor} theme="dark" />)).not.toThrow();
    }
  });
});
