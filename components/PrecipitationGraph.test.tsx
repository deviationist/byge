import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Frame } from "../lib/radar";
import { BANDS, NOTICEABLE } from "../lib/scale";
import {
  axisTicks,
  barHeight,
  HEIGHT_CEILING,
  isOpenEndedSeries,
  PrecipitationGraph,
  PrecipitationTimeline,
  shapeCaptionOf,
} from "./PrecipitationGraph";
import { Swatch } from "./Swatch";

function frame(over: Partial<Frame> & { minutes: number }): Frame {
  return {
    time: new Date(0),
    maxRate: 0,
    meanRate: 0,
    coverage: 0,
    observed: 1,
    centreRate: 0,
    nearestKm: null,
    ...over,
  };
}

/** 24 frames, 0..115 min, dry unless `rates` says otherwise. */
function series(rates: Record<number, number> = {}, over: Partial<Frame> = {}): Frame[] {
  return Array.from({ length: 24 }, (_, i) => {
    const r = rates[i] ?? 0;
    return frame({ minutes: i * 5, maxRate: r, coverage: r >= NOTICEABLE ? 1 : 0, ...over });
  });
}

const bars = () => screen.getAllByTestId("precip-bar");
const heightOf = (el: Element) => Number.parseFloat((el as HTMLElement).style.height);

describe("barHeight", () => {
  it("keeps climbing past 6 mm/h, where the comp's sqrt curve saturated", () => {
    // The whole point: a heavy bar and a torrential bar are different colours,
    // so they have to be different heights too.
    expect(barHeight(20)).toBeGreaterThan(barHeight(6) + 10);
  });

  it("is monotonic across every band boundary", () => {
    for (let i = 2; i < BANDS.length; i++) {
      expect(barHeight(BANDS[i].floor)).toBeGreaterThan(barHeight(BANDS[i - 1].floor));
    }
  });

  it("reaches full height exactly where the colour ramp stops distinguishing", () => {
    // Height and colour must saturate together or they encode different things.
    expect(HEIGHT_CEILING).toBe(BANDS[BANDS.length - 1].floor);
    expect(barHeight(HEIGHT_CEILING)).toBe(100);
    expect(barHeight(HEIGHT_CEILING * 4)).toBe(100);
  });

  it("keeps the low end readable — most rain here is under 1 mm/h", () => {
    // A linear scale would put light rain at 0.8 % of the strip.
    expect(barHeight(NOTICEABLE)).toBeGreaterThan(15);
    expect(barHeight(1)).toBeGreaterThan(30);
  });

  it("draws dry lower than the faintest wet band", () => {
    expect(barHeight(0)).toBeLessThan(barHeight(BANDS[1].floor));
  });
});

describe("PrecipitationGraph rendering", () => {
  it("renders one bar per frame", () => {
    render(<PrecipitationGraph frames={series()} theme="light" />);
    expect(bars()).toHaveLength(24);
  });

  it("renders nothing rather than an empty strip when there are no frames", () => {
    const { container } = render(<PrecipitationGraph frames={[]} theme="light" />);
    expect(container.firstElementChild).toBeNull();
  });

  it("colours bars from the band ramp, per theme", () => {
    const { container: light } = render(
      <PrecipitationGraph frames={series({ 5: 3.4 })} theme="light" />,
    );
    const { container: dark } = render(
      <PrecipitationGraph frames={series({ 5: 3.4 })} theme="dark" />,
    );
    const bar = (c: Element) =>
      (c.querySelectorAll('[data-testid="precip-bar"]')[5] as HTMLElement).style
        .backgroundColor;
    expect(bar(light)).toBe("rgb(0, 128, 255)"); // band 4 light
    expect(bar(dark)).toBe("rgb(85, 174, 245)"); // band 4 dark
  });

  it("draws a torrential bar visibly taller than a heavy one", () => {
    render(<PrecipitationGraph frames={series({ 3: 6, 4: 20 })} theme="light" />);
    const b = bars();
    expect(heightOf(b[4])).toBeGreaterThan(heightOf(b[3]) + 10);
  });

  it("holds sub-threshold moisture back so it does not read as a forecast", () => {
    render(<PrecipitationGraph frames={series({ 2: BANDS[1].floor, 3: 2 })} theme="light" />);
    const b = bars();
    expect(Number.parseFloat(b[2].style.opacity)).toBeLessThan(1);
    expect(Number.parseFloat(b[3].style.opacity)).toBe(1);
  });
});

describe("unobserved frames", () => {
  it("hatches rather than drawing a dry bar", () => {
    // maxRate is 0 for a blind frame, so falling through would render "we
    // cannot see here" as "it is dry here" — the failure this project exists
    // to avoid, reintroduced at the last step.
    const f = series();
    f[7] = frame({ minutes: 35, observed: 0 });
    render(<PrecipitationGraph frames={f} theme="light" />);
    const b = bars();
    expect(b[7].style.backgroundImage).toContain("repeating-linear-gradient");
    expect(heightOf(b[7])).toBe(100);
    expect(heightOf(b[6])).toBeLessThan(100);
  });

  it("uses the same hatch as the Swatch — one visual language, not two", () => {
    const f = series();
    f[0] = frame({ minutes: 0, observed: 0 });
    const { container: graph } = render(<PrecipitationGraph frames={f} theme="light" />);
    const { container: swatch } = render(<Swatch mode="blind" theme="light" />);
    const bar = graph.querySelector('[data-testid="precip-bar"]') as HTMLElement;
    expect(bar.style.backgroundImage).toBe(
      (swatch.firstElementChild as HTMLElement).style.backgroundImage,
    );
  });

  it("says 'not observed' in the label, never a rate", () => {
    const f = series();
    f[7] = frame({ minutes: 35, observed: 0 });
    render(<PrecipitationGraph frames={f} theme="light" />);
    expect(bars()[7].getAttribute("aria-label")).toMatch(/not observed/i);
  });

  it("does not hatch an observed dry frame", () => {
    render(<PrecipitationGraph frames={series()} theme="light" />);
    expect(bars()[0].style.backgroundImage).toBe("");
  });
});

describe("open-ended spells", () => {
  const stillWet = series({ 21: 4, 22: 4, 23: 4 });

  it("detects rain still falling at the last frame", () => {
    expect(isOpenEndedSeries(stillWet)).toBe(true);
    expect(isOpenEndedSeries(series({ 5: 4 }))).toBe(false);
  });

  it("runs off its own right edge instead of ending cleanly", () => {
    render(<PrecipitationGraph frames={stillWet} theme="light" />);
    const marker = screen.getByTestId("precip-overflow");
    expect(marker.style.backgroundImage).toContain("linear-gradient");
    // Negative margin, so it overhangs the strip rather than sitting inside it.
    expect(Number.parseFloat(marker.style.marginRight)).toBeLessThan(0);
  });

  it("has no overflow marker when the rain visibly stops", () => {
    render(<PrecipitationGraph frames={series({ 5: 4 })} theme="light" />);
    expect(screen.queryByTestId("precip-overflow")).toBeNull();
  });

  it("marks the horizon tick so the axis agrees with the strip", () => {
    expect(axisTicks(stillWet).at(-1)).toContain("⇥");
    expect(axisTicks(series({ 5: 4 })).at(-1)).toBe("+115");
  });
});

describe("axis and caption", () => {
  it("labels a forecast-only strip from now to the horizon", () => {
    expect(axisTicks(series())).toEqual(["now", "+30", "+60", "+90", "+115"]);
  });

  it("labels observed history when frames run negative", () => {
    const past = Array.from({ length: 17 }, (_, i) => frame({ minutes: (i - 17) * 5 }));
    expect(axisTicks([...past, ...series()])).toEqual(["−85 observed", "now", "+115 forecast"]);
  });

  it("captions the shape of the series", () => {
    expect(shapeCaptionOf(series())).toBe("clear");
    expect(shapeCaptionOf(series({ 12: 4 }))).toBe("one band");
    expect(shapeCaptionOf(series({ 0: 4 }))).toBe("easing");
    expect(shapeCaptionOf(series({ 23: 4 }))).toBe("runs past the horizon");
    expect(shapeCaptionOf(series({}, { observed: 0 }))).toBe("not observed");
  });
});

describe("one component, two densities", () => {
  it("renders both densities from the same component", () => {
    const f = series({ 5: 2 });
    const { container: compact } = render(
      <PrecipitationGraph frames={f} theme="light" density="compact" />,
    );
    const { container: expanded } = render(
      <PrecipitationGraph frames={f} theme="light" density="expanded" />,
    );
    const count = (c: Element) => c.querySelectorAll('[data-testid="precip-bar"]').length;
    expect(count(compact)).toBe(24);
    expect(count(expanded)).toBe(24);
    // Same encoding, different strip height — that is the whole difference.
    const strip = (c: Element) => {
      const bar = c.querySelector('[data-testid="precip-bar"]') as HTMLElement;
      return (bar.parentElement as HTMLElement).style.height;
    };
    expect(strip(compact)).not.toBe(strip(expanded));
  });

  it("is non-interactive unless onScrub is passed", () => {
    render(<PrecipitationGraph frames={series()} theme="light" />);
    // Must read as finished, not as a scrubber someone disabled.
    expect(bars()[0].getAttribute("role")).not.toBe("button");
  });

  it("becomes scrubbable when onScrub is passed", () => {
    const onScrub = vi.fn();
    render(
      <PrecipitationGraph
        frames={series()}
        theme="light"
        density="expanded"
        onScrub={onScrub}
        selectedIndex={3}
      />,
    );
    const b = bars();
    expect(b[0].getAttribute("role")).toBe("button");
    fireEvent.click(b[9]);
    expect(onScrub).toHaveBeenCalledWith(9);
  });

  it("marks the selected frame", () => {
    render(
      <PrecipitationGraph
        frames={series()}
        theme="light"
        density="expanded"
        onScrub={() => {}}
        selectedIndex={3}
      />,
    );
    const b = bars();
    expect(b[3].getAttribute("aria-selected")).toBe("true");
    expect(b[4].getAttribute("aria-selected")).toBe("false");
  });

  it("PrecipitationTimeline is a wrapper, not a second implementation", () => {
    const f = series({ 5: 2, 12: 8 });
    const { container: viaTimeline } = render(
      <PrecipitationTimeline frames={f} theme="light" onScrub={() => {}} selectedIndex={2} />,
    );
    const { container: viaGraph } = render(
      <PrecipitationGraph
        frames={f}
        theme="light"
        density="expanded"
        onScrub={() => {}}
        selectedIndex={2}
      />,
    );
    expect(viaTimeline.innerHTML).toBe(viaGraph.innerHTML);
  });
});
