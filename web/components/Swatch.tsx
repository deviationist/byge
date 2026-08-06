import { View } from "react-native";
import type { Verdict } from "../lib/forecast";
import { bandOf, colorOf, NOTICEABLE } from "../lib/scale";
import { HATCH } from "../theme/tokens";
import { Hatch } from "./Hatch";
import type { Theme } from "../theme/useTheme";

/**
 * The list glyph.
 *
 * THREE SHAPES, so intensity is never carried by colour alone:
 *
 *   filled   raining on you now
 *   outline  a spell on the way, drawn in its own band colour
 *   hatched  not observed — outside radar coverage
 *   faint    observed dry
 *
 * The hatch matters more than it looks: "we cannot see here" must never read as
 * "it is dry here", and a colour-blind reader has to get that distinction too.
 *
 * "Marker" is reserved for map pins. This is a swatch.
 */
export type SwatchMode = "now" | "later" | "dry" | "blind";

export type SwatchProps = {
  mode: SwatchMode;
  /** mm/h — picks the band colour for `now` and `later`. */
  rate?: number;
  size?: number;
  theme: Theme;
};

const TITLES: Record<SwatchMode, string> = {
  now: "raining now",
  later: "rain on the way",
  dry: "observed dry",
  blind: "not observed",
};

/** Which shape a verdict should show in a list. */
export function swatchModeOf(
  v: Pick<Verdict, "observed" | "rainingNow" | "frames">,
): SwatchMode {
  if (v.observed === 0) return "blind";
  if (v.rainingNow) return "now";
  const peak = v.frames.reduce((m, f) => Math.max(m, f.maxRate), 0);
  return peak >= NOTICEABLE ? "later" : "dry";
}

/** Peak rate across the series — what `later` should be coloured by. */
export function swatchRateOf(v: Pick<Verdict, "rainingNow" | "nowRate" | "frames">): number {
  if (v.rainingNow) return v.nowRate;
  return v.frames.reduce((m, f) => Math.max(m, f.maxRate), 0);
}

export function Swatch({ mode, rate = 0, size = 13, theme }: SwatchProps) {
  const color = colorOf(bandOf(rate), theme);
  const radius = Math.max(2, Math.round(size * 0.24));

  // Band colour comes from lib/scale.ts as a real value and STAYS inline: it is
  // computed per rate, and the same values drive canvas and SVG fills where no
  // class can reach. Only the chrome around it — the hairline, the dry fill,
  // the not-observed fill — is a token, so only that becomes a class.
  const shape = {
    now: { className: "border-line2", style: { backgroundColor: color, borderWidth: 1 } },
    later: {
      className: "bg-transparent",
      // Scales with size so the ring stays legible at 11px and at 24px.
      style: { borderWidth: Math.max(2, Math.round(size * 0.2)), borderColor: color },
    },
    dry: { className: "bg-dry border-line2", style: { borderWidth: 1 } },
    blind: { className: "bg-nodata border-nodata-line", style: { borderWidth: 1 } },
  }[mode];

  return (
    <View
      accessibilityLabel={TITLES[mode]}
      role="img"
      className={shape.className}
      style={[
        // `backgroundImage` paints the hatch on web and is inert on native,
        // where <Hatch /> draws the same pattern from the same numbers.
        { width: size, height: size, borderRadius: radius, flexShrink: 0 },
        shape.style,
        mode === "blind" ? ({ backgroundImage: HATCH } as object) : null,
      ]}
    >
      {mode === "blind" ? <Hatch size={size} /> : null}
    </View>
  );
}
