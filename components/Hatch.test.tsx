import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HATCH, HATCH_PATTERN } from "../theme/tokens";
import { Hatch } from "./Hatch";

/**
 * Two renderings of one pattern — this file guards the "one pattern" half.
 *
 * Web paints the hatch with a CSS gradient; React Native has no
 * `backgroundImage` and composes it from rotated views. That split is forced by
 * the platforms. What is NOT forced is two sets of numbers, and a hatch that is
 * 45° on web and 40° on native stops being one mark for "we cannot see here"
 * and becomes a texture that differs by device.
 */

describe("the hatch pattern", () => {
  it("builds the CSS gradient from the shared numbers, not a second copy", () => {
    const { angleDeg, lineWidth, period, color } = HATCH_PATTERN;
    expect(HATCH).toContain(`${angleDeg}deg`);
    expect(HATCH).toContain(color);
    expect(HATCH).toContain(`${lineWidth}px`);
    expect(HATCH).toContain(`${period}px`);
  });

  it("stays a repeating gradient — the strokes have to continue past one cell", () => {
    expect(HATCH).toMatch(/^repeating-linear-gradient\(/);
  });

  it("keeps the stroke narrower than the gap, so it reads as hatching not a fill", () => {
    expect(HATCH_PATTERN.lineWidth).toBeLessThan(HATCH_PATTERN.period / 2);
  });

  it("is neutral, never a band colour — absence of a reading is not a low one", () => {
    expect(HATCH_PATTERN.color).toMatch(/^rgba\(128, ?128, ?128/);
  });
});

describe("Hatch on web", () => {
  it("renders nothing, because the CSS gradient already painted it", () => {
    // Not a stub: the assertion is that web needs no extra element, which is
    // what keeps the DOM identical to before native was a target.
    const { container } = render(<Hatch size={13} />);
    expect(container.innerHTML).toBe("");
  });
});
