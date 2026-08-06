import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

const root = (c: Element) => c.firstElementChild as HTMLElement;
const kids = (c: Element) => Array.from(root(c).children) as HTMLElement[];

describe("BrandMark geometry", () => {
  it("is a band crossing a point — two bands plus a dot at full size", () => {
    const { container } = render(<BrandMark size={64} />);
    expect(kids(container)).toHaveLength(3);
  });

  it("drops to one heavier band and a bigger dot when small", () => {
    // Below ~40px two bands smear into one grey shape. The small cut is what
    // lets the mark survive as a 16px favicon instead of becoming a square.
    const { container } = render(<BrandMark size={16} />);
    expect(kids(container)).toHaveLength(2);
  });

  it("survives 16px with a dot that is still a visible proportion of the tile", () => {
    const { container } = render(<BrandMark size={16} />);
    const dot = kids(container).at(-1) as HTMLElement;
    const d = Number.parseFloat(dot.style.width);
    expect(d).toBeGreaterThan(16 * 0.25);
  });

  it("scales every part with size", () => {
    const small = render(<BrandMark size={32} />).container;
    const big = render(<BrandMark size={64} />).container;
    expect(root(small).style.width).toBe("32px");
    expect(root(big).style.width).toBe("64px");
  });

  it("tilts the bands rather than drawing them flat", () => {
    const { container } = render(<BrandMark size={64} />);
    expect(kids(container)[0].style.transform).toContain("rotate(-32deg)");
  });

  it("runs the bands off both edges and clips them to the tile", () => {
    // The band is wider than the tile on purpose — it crosses the mark, it does
    // not sit inside it.
    const { container } = render(<BrandMark size={64} />);
    const band = kids(container)[0];
    expect(Number.parseFloat(band.style.width)).toBeGreaterThan(64);
    // react-native-web expands `overflow` into its two axis longhands.
    expect(root(container).style.overflowX).toBe("hidden");
    expect(root(container).style.overflowY).toBe("hidden");
  });

  it("centres the dot", () => {
    const { container } = render(<BrandMark size={64} />);
    const dot = kids(container).at(-1) as HTMLElement;
    const left = Number.parseFloat(dot.style.left);
    const w = Number.parseFloat(dot.style.width);
    expect(left + w / 2).toBeCloseTo(32, 5);
  });
});

describe("BrandMark variants", () => {
  it("standard follows the theme background", () => {
    const light = render(<BrandMark size={64} theme="light" />).container;
    const dark = render(<BrandMark size={64} theme="dark" />).container;
    expect(root(light).style.backgroundColor).toBe("rgb(11, 42, 58)");
    expect(root(dark).style.backgroundColor).toBe("rgb(14, 17, 19)");
  });

  it("maskable is a different drawing, not the standard one with padding", () => {
    // Same size, same shape count — but the crossing point is pulled in to 68%
    // so an arbitrary Android crop cannot cut it off.
    const std = render(<BrandMark size={64} variant="standard" />).container;
    const msk = render(<BrandMark size={64} variant="maskable" />).container;

    const dotWidth = (c: Element) =>
      Number.parseFloat((kids(c).at(-1) as HTMLElement).style.width);
    expect(dotWidth(msk)).toBeLessThan(dotWidth(std));

    const bandTop = (c: Element) => Number.parseFloat(kids(c)[0].style.top);
    expect(Math.abs(bandTop(msk) - 32)).toBeLessThan(Math.abs(bandTop(std) - 32));
  });

  it("maskable goes full-bleed square — the corners are the crop's to take", () => {
    // react-native-web expands `borderRadius` into the four corner longhands,
    // so `.borderRadius` is always empty here — assert on a corner.
    const std = render(<BrandMark size={64} variant="standard" />).container;
    const msk = render(<BrandMark size={64} variant="maskable" />).container;
    expect(root(std).style.borderTopLeftRadius).toBe("14px");
    expect(root(msk).style.borderTopLeftRadius).toBe("0px");
  });

  it("maskable keeps the mark inside the 80% safe circle", () => {
    // Everything that identifies the mark — the dot and the band crossing —
    // must sit within r = 0.4 * size of the centre.
    const { container } = render(<BrandMark size={64} variant="maskable" />);
    const dot = kids(container).at(-1) as HTMLElement;
    const r = Number.parseFloat(dot.style.width) / 2;
    const cx = Number.parseFloat(dot.style.left) + r;
    const cy = Number.parseFloat(dot.style.top) + r;
    expect(Math.hypot(cx - 32, cy - 32) + r).toBeLessThanOrEqual(64 * 0.4);
  });

  it("maskable ships no safe-circle guide", () => {
    // The design comp draws a dashed 80% circle to annotate the variant. That
    // is documentation; shipping it would put a dashed ring on the launcher.
    const { container } = render(<BrandMark size={64} variant="maskable" />);
    expect(container.innerHTML).not.toContain("dashed");
  });

  it("monochrome is one ink on one ground", () => {
    const { container } = render(<BrandMark size={64} variant="monochrome" />);
    expect(root(container).style.backgroundColor).toBe("rgb(0, 0, 0)");
    for (const child of kids(container)) {
      expect(child.style.backgroundColor).toBe("rgb(255, 255, 255)");
    }
  });

  it("monochrome ignores the theme — its purpose fixes its colours", () => {
    const a = render(<BrandMark size={64} variant="monochrome" theme="light" />).container;
    const b = render(<BrandMark size={64} variant="monochrome" theme="dark" />).container;
    expect(root(a).style.backgroundColor).toBe(root(b).style.backgroundColor);
  });
});

describe("BrandMark accessibility", () => {
  it("is a labelled image", () => {
    const { container } = render(<BrandMark />);
    expect(root(container).getAttribute("role")).toBe("img");
    expect(root(container).getAttribute("aria-label")).toBe("byge");
  });

  it("renders every variant at every icon size without throwing", () => {
    for (const size of [16, 32, 48, 96, 180, 192, 512]) {
      for (const variant of ["standard", "maskable", "monochrome"] as const) {
        expect(() => render(<BrandMark size={size} variant={variant} />)).not.toThrow();
      }
    }
  });
});
