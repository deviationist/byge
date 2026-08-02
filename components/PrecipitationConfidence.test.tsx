import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Verdict } from "../lib/forecast";
import { NFRAMES } from "../lib/grid";
import { confidenceSubject, PrecipitationConfidence } from "./PrecipitationConfidence";

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

const on = () => screen.queryAllByTestId("confidence-bar-on");
const off = () => screen.queryAllByTestId("confidence-bar-off");

describe("confidenceSubject", () => {
  it("names what the confidence is about, not just its level", () => {
    // "high" alone hides the difference between reading the radar now and
    // predicting 20 minutes out. The second half of the sentence is the hedge.
    expect(confidenceSubject(verdictLike({ rainingNow: true }))).toBe("reading now");
    expect(
      confidenceSubject(
        verdictLike({ next: { startMin: 45, endMin: 70, peakRate: 3, meanRate: 2 } }),
      ),
    ).toBe("+45 min out");
    expect(confidenceSubject(verdictLike({}))).toBe("clear field");
  });
});

describe("PrecipitationConfidence", () => {
  it("shows three bars for high", () => {
    render(
      <PrecipitationConfidence verdict={verdictLike({ rainingNow: true })} theme="light" />,
    );
    expect(on()).toHaveLength(3);
    expect(off()).toHaveLength(0);
  });

  it("shows two for moderate", () => {
    render(
      <PrecipitationConfidence
        verdict={verdictLike({ next: { startMin: 45, endMin: 70, peakRate: 3, meanRate: 2 } })}
        theme="light"
      />,
    );
    expect(on()).toHaveLength(2);
    expect(off()).toHaveLength(1);
  });

  it("shows one for low", () => {
    render(
      <PrecipitationConfidence
        verdict={verdictLike({
          next: { startMin: 95, endMin: null, peakRate: 3, meanRate: 2 },
        })}
        theme="light"
      />,
    );
    expect(on()).toHaveLength(1);
    expect(off()).toHaveLength(2);
  });

  it("stays high while raining on you, even with no end in sight", () => {
    // Labelling an observation `low` because its tail is open would be absurd —
    // the rain is measured, only the ending is forecast.
    render(
      <PrecipitationConfidence
        verdict={verdictLike({
          rainingNow: true,
          current: { startMin: 0, endMin: null, peakRate: 4, meanRate: 3 },
        })}
        theme="light"
      />,
    );
    expect(on()).toHaveLength(3);
    expect(screen.getByText(/high confidence · reading now/)).toBeTruthy();
  });

  it("renders nothing for a blind location", () => {
    // "high confidence" beside "we cannot see this place" would read as
    // confidence in the non-answer.
    const { container } = render(
      <PrecipitationConfidence verdict={verdictLike({ observed: 0 })} theme="light" />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  it("reads the same to a screen reader as it does on screen", () => {
    const { container } = render(
      <PrecipitationConfidence verdict={verdictLike({ rainingNow: true })} theme="light" />,
    );
    expect((container.firstElementChild as HTMLElement).getAttribute("aria-label")).toBe(
      "high confidence · reading now",
    );
  });

  it("is not tinted by the precipitation ramp", () => {
    // Confidence is not an intensity. A torrential forecast must not look more
    // certain than a drizzle one, so both render identical bars.
    const heavy = render(
      <PrecipitationConfidence
        verdict={verdictLike({ rainingNow: true, nowRate: 24 })}
        theme="light"
      />,
    );
    const light = render(
      <PrecipitationConfidence
        verdict={verdictLike({ rainingNow: true, nowRate: 0.3 })}
        theme="light"
      />,
    );
    expect(heavy.container.innerHTML).toBe(light.container.innerHTML);
  });
});
