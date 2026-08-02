import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Verdict } from "../lib/forecast";
import { NFRAMES } from "../lib/grid";
import { BANDS, NOTICEABLE } from "../lib/scale";
import { levelCardCopy, PrecipitationLevelCard } from "./PrecipitationLevelCard";

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

describe("levelCardCopy", () => {
  it("names the band and the feeling while raining", () => {
    const c = levelCardCopy(verdictLike({ rainingNow: true, nowRate: 6.2 }));
    expect(c.label).toBe("heavy rain");
    expect(c.feelsLike).toBe("soaked in minutes");
    expect(c.rate).toBe("6.2 mm/h");
  });

  it("qualifies the label when the rain is inside the radius but not on you", () => {
    // "heavy rain / soaked in minutes" would be a promise about the user that
    // the any-touch rule does not make.
    const c = levelCardCopy(
      verdictLike({ rainingNow: true, nowRate: 6.2, edgeOnly: true, nearestKm: 4 }),
    );
    expect(c.label).toBe("nearby: heavy rain");
    expect(c.feelsLike).not.toBe("soaked in minutes");
  });

  it("uses the peak of the series for incoming rain, not the leading drizzle", () => {
    const v = verdictLike({});
    v.frames[8].maxRate = 0.5;
    v.frames[12].maxRate = 9.1;
    v.next = { startMin: 40, endMin: 70, peakRate: 9.1, meanRate: 4 };
    const c = levelCardCopy(v);
    expect(c.label).toBe("incoming: heavy rain");
    expect(c.rate).toBe("peak 9.1 mm/h");
  });

  it("reports no rate at all for a blind location", () => {
    // "0.0 mm/h" would be a measurement we do not have.
    const c = levelCardCopy(verdictLike({ observed: 0 }));
    expect(c.rate).toBe("—");
    expect(c.label).toMatch(/not observed/i);
    expect(c.feelsLike).toMatch(/no claim/i);
  });

  it("says <0.2 rather than 0.0 when radar sees sub-threshold moisture", () => {
    // A flat 0.0 next to a note about a trace at +80 min reads as a
    // contradiction. The trace is real; it just is not rain.
    const v = verdictLike({});
    v.frames[16].maxRate = NOTICEABLE - 0.01;
    const c = levelCardCopy(v);
    expect(c.label).toBe("dry");
    expect(c.rate).toBe("<0.2 mm/h");
  });

  it("says 0.0 when the field really is empty", () => {
    expect(levelCardCopy(verdictLike({})).rate).toBe("0.0 mm/h");
  });
});

describe("PrecipitationLevelCard rendering", () => {
  const swatch = () => screen.getAllByRole("img")[0];

  it("shows label, feeling and rate together", () => {
    render(
      <PrecipitationLevelCard
        verdict={verdictLike({ rainingNow: true, nowRate: 6.2 })}
        theme="light"
      />,
    );
    expect(screen.getByText("heavy rain")).toBeTruthy();
    expect(screen.getByText("soaked in minutes")).toBeTruthy();
    expect(screen.getByText("6.2 mm/h")).toBeTruthy();
  });

  it("fills the swatch in the band colour while raining", () => {
    render(
      <PrecipitationLevelCard
        verdict={verdictLike({ rainingNow: true, nowRate: 3.4 })}
        theme="light"
      />,
    );
    expect(swatch().style.backgroundColor).toBe("rgb(0, 128, 255)"); // band 4 light
  });

  it("uses the dark ramp in dark mode", () => {
    render(
      <PrecipitationLevelCard
        verdict={verdictLike({ rainingNow: true, nowRate: 3.4 })}
        theme="dark"
      />,
    );
    expect(swatch().style.backgroundColor).toBe("rgb(85, 174, 245)");
  });

  it("hatches for a blind location rather than showing a dry swatch", () => {
    render(<PrecipitationLevelCard verdict={verdictLike({ observed: 0 })} theme="light" />);
    expect(swatch().style.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("draws incoming rain as a ring, matching the list row", () => {
    // react-native-web expands the border shorthand and normalises transparent.
    const v = verdictLike({});
    v.frames[12].maxRate = 3.4;
    render(<PrecipitationLevelCard verdict={v} theme="light" />);
    expect(swatch().style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(swatch().style.borderTopColor).toBe("rgb(0, 128, 255)");
  });

  it("labels the whole badge for screen readers", () => {
    const { container } = render(
      <PrecipitationLevelCard
        verdict={verdictLike({ rainingNow: true, nowRate: 6.2 })}
        theme="light"
      />,
    );
    const label = (container.firstElementChild as HTMLElement).getAttribute("aria-label");
    expect(label).toContain("heavy rain");
    expect(label).toContain("6.2 mm/h");
  });

  it("renders every band without throwing", () => {
    for (const b of BANDS) {
      expect(() =>
        render(
          <PrecipitationLevelCard
            verdict={verdictLike({ rainingNow: true, nowRate: b.floor })}
            theme="dark"
          />,
        ),
      ).not.toThrow();
    }
  });
});
