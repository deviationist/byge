import { describe, expect, it } from "vitest";
import { FILL_THRESHOLD } from "../lib/opendap";
import { NOTICEABLE } from "../lib/scale";
import { cellPaint } from "./RadarLayer";

/**
 * The one decision this layer must never get wrong. A heatmap's natural
 * instinct is to give every cell a colour, and both exceptions here are places
 * where doing that would state something byge does not know.
 */

describe("cellPaint", () => {
  it("never paints an unobserved cell as rain", () => {
    // The central claim of the whole app. A cell the mosaic cannot see, given
    // even the palest band, becomes an observation we do not have.
    expect(cellPaint(FILL_THRESHOLD)).toBe("blind");
    expect(cellPaint(9.96921e36)).toBe("blind");
  });

  it("treats NaN as unobserved, not as zero", () => {
    // NaN fails every comparison, so a `>=` test would let it through as
    // observed and it would render as dry ground over the open sea.
    expect(cellPaint(Number.NaN)).toBe("blind");
  });

  it("leaves observed dry as the map, rather than a faint wash", () => {
    // A pale fill over dry ground reads as drizzle at a glance, which inverts
    // the answer for anyone skimming.
    expect(cellPaint(0)).toBe("dry");
    expect(cellPaint(0.01)).toBe("dry");
  });

  it("paints real rain in its own band", () => {
    const light = cellPaint(NOTICEABLE);
    expect(light).not.toBe("dry");
    expect(light).not.toBe("blind");
    expect(typeof light === "object" && light.index).toBeGreaterThan(0);
  });

  it("keeps sub-threshold moisture visible without calling it rain", () => {
    // Bands 1 and 2 are below the "noticeable" line but still observed, and the
    // map is the one place they belong: the verdict deliberately ignores them,
    // and someone checking WHY should see what the verdict chose to discount.
    const trace = cellPaint(0.04);
    expect(trace).not.toBe("dry");
    expect(typeof trace === "object" && trace.index).toBeLessThan(3);
  });
});
