import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MEASURE, Screen } from "./Screen";

const inner = () => screen.getByTestId("s-measure");
const outer = () => screen.getByTestId("s");

describe("Screen", () => {
  it("caps the reading measure at 620px", () => {
    // A verdict sentence set across a 1400px window is unreadable — the eye
    // loses the line on the return sweep.
    render(<Screen testID="s">content</Screen>);
    expect(inner().style.maxWidth).toBe(`${MEASURE}px`);
  });

  it("gives the extra width to whitespace rather than to the content", () => {
    // Centred, not left-aligned against a wide gutter.
    render(<Screen testID="s">content</Screen>);
    expect(inner().style.alignSelf).toBe("center");
    expect(inner().style.width).toBe("100%");
  });

  it("lets a full-bleed surface opt out", () => {
    // The map is a field to pan, not a line to read.
    render(
      <Screen testID="s" measure={null}>
        map
      </Screen>,
    );
    expect(inner().style.maxWidth).toBe("");
  });

  it("takes a custom measure", () => {
    render(
      <Screen testID="s" measure={480}>
        content
      </Screen>,
    );
    expect(inner().style.maxWidth).toBe("480px");
  });

  it("adds safe-area insets to the page padding rather than replacing it", () => {
    // A bare env() would collapse the padding to zero on every device without
    // a notch, which is most of them.
    render(<Screen testID="s">content</Screen>);
    const s = outer().style;
    for (const side of ["Top", "Bottom", "Left", "Right"] as const) {
      const value = s[`padding${side}` as "paddingTop"];
      expect(value).toMatch(/^calc\(\d+px \+ env\(safe-area-inset-/);
    }
  });

  it("fills the viewport so a short screen still paints its background", () => {
    render(<Screen testID="s">content</Screen>);
    expect(outer().style.flex).not.toBe("");
    // The class contract: colour arrives via Uniwind now, so the token is
    // asserted by the class that carries it rather than by an inline var().
    expect(outer().className).toContain("bg-bg");
  });

  it("renders its children", () => {
    render(
      <Screen>
        <span data-testid="child" />
      </Screen>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("only spaces children when asked", () => {
    // Most screens compose their own rhythm; an unconditional gap would fight
    // the ones that do.
    render(<Screen testID="s">content</Screen>);
    expect(inner().style.gap).toBe("");
  });

  it("applies the gap when given", () => {
    render(
      <Screen testID="s" gap={26}>
        content
      </Screen>,
    );
    expect(inner().style.gap).toBe("26px");
  });
});
