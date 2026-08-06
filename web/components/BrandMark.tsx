import { View } from "react-native";
import type { Theme } from "../theme/useTheme";

/**
 * A band crossing a point.
 *
 * "byge" is a shower — a band of rain that passes over somewhere. The mark is
 * literally that: solid bands on a diagonal, and a dot for the place they cross.
 * Two shapes and a dot, nothing that needs a renderer to be clever.
 *
 * DRAWN WITH PLAIN VIEWS, NOT SVG. `react-native-svg` is not a dependency of
 * this project (checked in package.json), and adding one for three rectangles
 * is not worth it. The geometry below is the design's 64-unit viewBox scaled
 * by `size / 64`, so it stays identical if it is ever ported to SVG.
 *
 * Below ~40px the two-band reading collapses into a smudge, so small sizes
 * switch to a single heavier band and a larger dot. That is what lets the mark
 * survive 16px as a favicon instead of turning into a grey square.
 */
export type BrandMarkVariant = "standard" | "maskable" | "monochrome";

export type BrandMarkProps = {
  size?: number;
  variant?: BrandMarkVariant;
  /** Only affects `standard` — the other two variants are fixed by their purpose. */
  theme?: Theme;
};

/** The design's coordinate space. Everything below is in these units, then scaled. */
const VIEWBOX = 64;
const CENTRE = VIEWBOX / 2;
const BAND_W = 108; // deliberately wider than the tile — the bands run off both edges
const ANGLE_DEG = -32;
const RAD = (ANGLE_DEG * Math.PI) / 180;
const COS = Math.cos(RAD);
const SIN = Math.sin(RAD);
const SMALL_AT = 40;

type Palette = { bg: string; band: string; band2: string; dot: string };

function paletteOf(variant: BrandMarkVariant, theme: Theme): Palette {
  if (variant === "monochrome") {
    // Single ink, for tinted Android surfaces and pinned tabs. The dot reads
    // because it sits in the gap between the two bands, not because of hue.
    return { bg: "#000000", band: "#FFFFFF", band2: "#FFFFFF", dot: "#FFFFFF" };
  }
  return {
    bg: theme === "dark" ? "#0E1113" : "#0B2A3A",
    band: "#00AAFF",
    band2: "#0080FF",
    dot: "#F6F4F0",
  };
}

/**
 * Position a band so that rotating it about *its own* centre lands it exactly
 * where rotating the whole drawing about the tile centre would.
 *
 * The design rotates one group about (32,32). React Native has no transform
 * origin, so each band rotates about itself instead — which would leave the
 * bands parallel but in the wrong place. Pre-translating the centre by the same
 * rotation makes the two constructions identical.
 */
function bandStyle(y0: number, y1: number, k: number, color: string, opacity: number) {
  const d = (y0 + y1) / 2 - CENTRE;
  const cx = CENTRE - SIN * d;
  const cy = CENTRE + COS * d;
  const h = y1 - y0;
  return {
    position: "absolute" as const,
    left: (cx - BAND_W / 2) * k,
    top: (cy - h / 2) * k,
    width: BAND_W * k,
    height: h * k,
    backgroundColor: color,
    opacity,
    transform: [{ rotate: `${ANGLE_DEG}deg` }],
  };
}

export function BrandMark({
  size = 32,
  variant = "standard",
  theme = "light",
}: BrandMarkProps) {
  const maskable = variant === "maskable";
  const k = size / VIEWBOX;
  const { bg, band, band2, dot } = paletteOf(variant, theme);

  // The maskable variant is a genuinely different drawing, not the standard one
  // with padding: Android crops icons to an arbitrary shape, so the mark is
  // redrawn at 68% about the centre to stay inside the 80% safe circle, and the
  // tile goes full-bleed square because the corners will be cut off anyway.
  // The bands still run off the edges — that is wanted; what has to survive the
  // crop is the crossing point, and that is what the inset pulls in.
  const inset = maskable ? 0.68 : 1;
  const corner = maskable ? 0 : 14;
  const g = (y: number) => CENTRE + (y - CENTRE) * inset;

  const small = size <= SMALL_AT;
  const bands = small
    ? [bandStyle(g(36), g(48), k, band, 1)]
    : [bandStyle(g(19), g(27), k, band2, 0.75), bandStyle(g(38), g(46), k, band, 0.95)];

  const r = (small ? 9.6 : 6.2) * inset * k;

  return (
    <View
      accessibilityLabel="byge"
      // RN View, not a DOM element — `role` is the accessibility role, and
      // there is no <img> to reach for here.
      role="img"
      style={{
        width: size,
        height: size,
        borderRadius: corner * k,
        backgroundColor: bg,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {bands.map((style, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static geometry
        <View key={i} style={style} />
      ))}
      <View
        style={{
          position: "absolute",
          left: CENTRE * k - r,
          top: CENTRE * k - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: dot,
        }}
      />
    </View>
  );
}
