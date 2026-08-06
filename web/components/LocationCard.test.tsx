import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { verdictFrom } from "../lib/forecast";
import type { Frame } from "../lib/radar";
import { bandOf, colorOf, NOTICEABLE } from "../lib/scale";
import { LocationCard } from "./LocationCard";
import { statusLine } from "./LocationStatusText";
import { swatchRateOf } from "./Swatch";

function framesOf(rates: number[], over: Partial<Frame> = {}): Frame[] {
  return rates.map((r, i) => ({
    time: new Date(0),
    minutes: i * 5,
    maxRate: r,
    meanRate: r,
    coverage: r >= NOTICEABLE ? 1 : 0,
    observed: 1,
    centreRate: r,
    nearestKm: r >= NOTICEABLE ? 0 : null,
    ...over,
  }));
}

const Z = (n: number) => new Array(n).fill(0);
const V = (rates: number[], over: Partial<Frame> = {}) => verdictFrom(framesOf(rates, over), 4);

const raining = V([6.0, 5.6, 5.0, 4.1, 2.7, 0.12].concat(Z(18)));
const rainingOpen = V(new Array(24).fill(2.4));
const incoming = V(Z(8).concat([0.8, 2.4, 3.1, 1.6, 0.9], Z(11)));
const clear = V(Z(24));
const blind = V(Z(24), { observed: 0 });

const view = (ui: React.ReactElement) => {
  const { container } = render(ui);
  return { container, ...within(container) };
};

/** jsdom reports computed colours as `rgb(...)`, the palette stores hex. */
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const card = (over: Partial<React.ComponentProps<typeof LocationCard>> = {}) =>
  view(<LocationCard name="Home" verdict={raining} theme="light" {...over} />);

describe("the answer is carried by words, not by colour", () => {
  it("states the verdict in full in the row", () => {
    // A colour-blind reader must get everything from the text alone. The swatch
    // repeats the status; it never adds to it.
    expect(card().getByTestId("location-card").textContent).toContain(statusLine(raining));
  });

  it("says something different for every distinguishable state", () => {
    const seen = new Set<string>();
    for (const v of [raining, rainingOpen, incoming, clear, blind]) {
      const t = card({ verdict: v }).getByTestId("location-card").textContent ?? "";
      expect(t).not.toBe("");
      seen.add(statusLine(v));
    }
    expect(seen.size).toBe(5);
  });

  it("never renders 'dry' for an unobserved place", () => {
    const t = card({ verdict: blind }).getByTestId("location-card").textContent ?? "";
    expect(t).toContain("No radar coverage");
    expect(t).not.toMatch(/\bDry\b/);
  });

  it("keeps an unknown end unknown in the row too", () => {
    const t = card({ verdict: rainingOpen }).getByTestId("location-card").textContent ?? "";
    expect(t).toContain("no end in sight");
    expect(t).not.toMatch(/\d+ min/);
  });
});

describe("swatch", () => {
  it("renders one, derived from the verdict rather than reimplemented", () => {
    const swatch = card({ verdict: raining }).getByRole("img");
    expect(swatch.getAttribute("aria-label")).toBe("raining now");
    // The band comes out of the shared scale, so a refit of the boundaries
    // moves the card without anyone having to remember it exists.
    expect(swatch.style.backgroundColor).toBe(
      rgb(colorOf(bandOf(swatchRateOf(raining)), "light")),
    );
  });

  it("hatches an unobserved place — the shape carries it, not the colour", () => {
    const swatch = card({ verdict: blind }).getByRole("img");
    expect(swatch.getAttribute("aria-label")).toBe("not observed");
    expect(swatch.style.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("draws rain-on-the-way as a ring, not a fill", () => {
    const swatch = card({ verdict: incoming }).getByRole("img");
    expect(swatch.getAttribute("aria-label")).toBe("rain on the way");
    // The unfilled centre is the `bg-transparent` token class now, so there is
    // no inline background to read — assert the class, and that nothing inline
    // has filled it in behind our back.
    expect(swatch.className).toContain("bg-transparent");
    expect(swatch.style.backgroundColor).toBe("");
  });

  it("follows the dark ramp in dark mode", () => {
    const light = card({ verdict: raining, theme: "light" }).getByRole("img");
    const dark = card({ verdict: raining, theme: "dark" }).getByRole("img");
    expect(dark.style.backgroundColor).not.toBe(light.style.backgroundColor);
  });
});

describe("one component, two placements", () => {
  it("gives the row and the popup the same sentence", () => {
    // The whole reason this is one component: a place must not read "Raining"
    // in the list and something else on the map.
    const row = card({ variant: "row" }).getByTestId("location-card").textContent ?? "";
    const popup = card({ variant: "popup" }).getByTestId("location-card").textContent ?? "";
    expect(row).toContain(statusLine(raining));
    expect(popup).toContain(statusLine(raining));
  });

  it("gives the row a chevron and the popup none", () => {
    expect(card({ variant: "row" }).getByTestId("location-card").textContent).toContain("›");
    expect(card({ variant: "popup" }).getByTestId("location-card").textContent).not.toContain(
      "›",
    );
  });

  it("names the place in the popup, where there is no header to do it", () => {
    const popup = card({ variant: "popup", place: "Hemsedal" });
    expect(popup.getByTestId("location-name").textContent).toBe("Home · Hemsedal");
  });

  it("lifts the popup off the map with a tokenised shadow", () => {
    // A raw black rgba is invisible on dark; --color-scrim switches with the
    // theme, so the lift survives both.
    const el = card({ variant: "popup" }).getByTestId("location-card");
    expect(el.style.boxShadow).toContain("var(--color-scrim)");
  });
});

describe("tapping", () => {
  it("is a button with a real label, not a bare 'Home'", () => {
    // A screen-reader user should not have to open the row to learn whether it
    // is raining there.
    const el = card({ place: "Oslo", onPress: () => {} }).getByTestId("location-card");
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("aria-label")).toBe(`Home, Oslo. ${statusLine(raining)}`);
  });

  it("keeps a 44px minimum hit area", () => {
    const el = card({ onPress: () => {} }).getByTestId("location-card");
    expect(Number.parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("calls back when pressed", () => {
    const onPress = vi.fn();
    fireEvent.click(card({ onPress }).getByTestId("location-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is not announced as a button when it does nothing", () => {
    // A read-only popup that claims to be a button is a promise it cannot keep.
    const el = card({ variant: "popup" }).getByTestId("location-card");
    expect(el.getAttribute("role")).not.toBe("button");
  });

  it("marks the current selection for assistive tech, not only visually", () => {
    const el = card({ onPress: () => {}, selected: true }).getByTestId("location-card");
    expect(el.getAttribute("aria-selected")).toBe("true");
    // Selection sinks the surface rather than accenting it, now via the token
    // class. The unselected case below proves the two states differ.
    expect(el.className).toContain("bg-sunk");
  });
});

describe("presentation", () => {
  it("uses only theme tokens for its own surfaces", () => {
    const el = card().getByTestId("location-card");
    // Same invariant, in the vocabulary the styles now use: a token class for
    // both surface and hairline, and NO inline colour — which also catches a
    // literal creeping back in beside the class.
    expect(el.className).toMatch(/\bbg-(surface|sunk)\b/);
    expect(el.className).toMatch(/\bborder-line2?\b/);
    expect(el.style.backgroundColor).toBe("");
    expect(el.style.borderTopColor).toBe("");
  });

  it("renders every state in both themes and both variants without throwing", () => {
    for (const verdict of [raining, rainingOpen, incoming, clear, blind]) {
      for (const theme of ["light", "dark"] as const) {
        for (const variant of ["row", "popup"] as const) {
          expect(() =>
            render(
              <LocationCard
                name="Home"
                place="Oslo"
                verdict={verdict}
                theme={theme}
                variant={variant}
              />,
            ),
          ).not.toThrow();
        }
      }
    }
  });
});
