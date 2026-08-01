import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANDS } from "./scale";

/**
 * Guards the CSS token layer against the failure found while scaffolding.
 *
 * A plain `@theme` block only emits variables that generated utilities happen
 * to reference, so Tailwind tree-shook every band no screen used yet — while
 * the `.dark` block, being plain CSS, was emitted verbatim. The build ended up
 * with dark overrides for variables that had no light definition: correct in
 * dark mode, silently broken in light, and only for the colours that carry
 * meaning.
 *
 * Source-level rather than build-level so it runs in milliseconds and catches
 * the likeliest regression: adding a band to scale.ts and forgetting the CSS.
 */
const css = readFileSync(fileURLToPath(new URL("../global.css", import.meta.url)), "utf8");

function varsIn(selector: "theme" | "dark"): Map<string, string> {
  const re = selector === "theme" ? /@theme[^{]*\{([\s\S]*?)\n\}/ : /\.dark\s*\{([\s\S]*?)\n\}/;
  const block = css.match(re);
  if (!block) throw new Error(`no ${selector} block in global.css`);
  const out = new Map<string, string>();
  for (const m of block[1].matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

describe("theme tokens", () => {
  it("uses `@theme static` so nothing is tree-shaken", () => {
    // Without `static`, unused bands vanish from the light palette while their
    // dark overrides survive. See the block comment above.
    expect(css).toMatch(/@theme\s+static\s*\{/);
  });

  const theme = varsIn("theme");
  const dark = varsIn("dark");

  for (const band of BANDS) {
    if (band.index === 0) continue;
    const key = `b${band.index}`;

    it(`band ${band.index} (${band.label}) has a light token matching scale.ts`, () => {
      expect(theme.get(key)).toBe(band.light.toLowerCase());
    });

    it(`band ${band.index} (${band.label}) has a dark token matching scale.ts`, () => {
      expect(dark.get(key)).toBe(band.dark.toLowerCase());
    });
  }

  it("defines every dark override in the light palette too", () => {
    // The exact shape of the original bug: an override with nothing to override.
    const orphans = [...dark.keys()].filter((k) => !theme.has(k));
    expect(orphans).toEqual([]);
  });

  it("keeps no-data out of the precipitation ramp", () => {
    // Rendering "we cannot see here" as an intensity is the failure this whole
    // project is built to avoid.
    const bandValues = new Set(BANDS.map((b) => b.light.toLowerCase()));
    expect(bandValues.has(theme.get("nodata")!)).toBe(false);
    expect(theme.has("nodata")).toBe(true);
    expect(theme.has("dry")).toBe(true);
  });

  it("keeps dry and no-data visually distinct in both themes", () => {
    expect(theme.get("dry")).not.toBe(theme.get("nodata"));
    expect(dark.get("dry")).not.toBe(dark.get("nodata"));
  });
});

describe("dark ramp inverts luminance", () => {
  // Light runs pale -> dark. On a dark background those pale bands would
  // out-shout the heavy ones and invert the scale, so dark must run dim ->
  // bright. Ordering IS the meaning; the hex values only carry it.
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it("light ramp gets darker as intensity rises", () => {
    const l = BANDS.filter((b) => b.index > 0).map((b) => lum(b.light));
    expect(lum(BANDS[1].light)).toBeGreaterThan(lum(BANDS[6].light));
    expect(l[0]).toBeGreaterThan(l[l.length - 1]);
  });

  it("dark ramp gets brighter as intensity rises", () => {
    const d = BANDS.filter((b) => b.index > 0).map((b) => lum(b.dark));
    expect(lum(BANDS[6].dark)).toBeGreaterThan(lum(BANDS[1].dark));
    expect(d[0]).toBeLessThan(d[d.length - 1]);
  });

  it("dark ramp climbs monotonically through heavy rain", () => {
    const d = BANDS.filter((b) => b.index > 0 && b.index <= 5).map((b) => lum(b.dark));
    for (let i = 1; i < d.length; i++) {
      expect(d[i]).toBeGreaterThan(d[i - 1]);
    }
  });

  it("KNOWN DEVIATION: torrential dips below heavy rain in dark mode", () => {
    // Measured: b1..b5 climb +0.113, +0.167, +0.090, +0.087 — then b6 DROPS
    // 0.144. So the single most severe band renders dimmer than the one below
    // it, which is the same inversion the dark ramp exists to prevent, just at
    // the top of the scale instead of the bottom.
    //
    // Both palettes shift hue to purple at b6 (yr's own light value is
    // #7A0087). In light mode that still works, because darker means more
    // intense and the light ramp stays monotonic all the way down to 0.140. In
    // dark mode "brighter means more intense", and #C77BD6 does not clear the
    // bright blue below it.
    //
    // NOT silently corrected here — it is Design's palette. Raised in
    // design/FEEDBACK-02.md; candidate values that keep the purple hue and
    // clear b5 are #E0AEEA (+0.025) and #E8BCF4 (+0.074).
    //
    // This test asserts the deviation so it stays visible. When Design resolves
    // it, delete this and extend the monotonic test above to all six bands.
    const heavy = lum(BANDS[5].dark);
    const torrential = lum(BANDS[6].dark);
    expect(torrential).toBeLessThan(heavy);
  });
});
