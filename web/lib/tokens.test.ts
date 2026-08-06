// @vitest-environment node
//
// Reads global.css off disk. Under jsdom `import.meta.url` is rewritten to an
// http URL and fileURLToPath rejects it, so this file opts back into node.
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const css = readFileSync(join(process.cwd(), "global.css"), "utf8");

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

    it(`band ${band.index} (${band.key}) has a light token matching scale.ts`, () => {
      expect(theme.get(key)).toBe(band.light.toLowerCase());
    });

    it(`band ${band.index} (${band.key}) has a dark token matching scale.ts`, () => {
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

  it("dark ramp is monotonic across ALL SIX bands", () => {
    // Band 6 was #C77BD6 (lum 0.571) and DIPPED 0.144 below heavy rain, which
    // reintroduced at the top of the scale exactly the inversion the dark ramp
    // exists to prevent. Design resolved it to #E8BCF4 (0.790, +0.074 over
    // band 5), keeping the ~288 deg purple as a categorical second signal.
    //
    // Hue is never the only signal: it is the one a colour-blind reader may
    // not receive, on the band where being noticed matters most.
    const d = BANDS.filter((b) => b.index > 0).map((b) => lum(b.dark));
    for (let i = 1; i < d.length; i++) {
      expect(d[i]).toBeGreaterThan(d[i - 1]);
    }
  });
});
