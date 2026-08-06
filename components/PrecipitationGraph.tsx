import type { DimensionValue } from "react-native";
import { Pressable, Text, View } from "react-native";
import { isWet } from "../lib/forecast";
import { type Frame, isBlind } from "../lib/radar";
import { BANDS, bandOf, colorOf, describeRate, NOTICEABLE } from "../lib/scale";
import { HATCH, MONO } from "../theme/tokens";
import { Hatch } from "./Hatch";
import type { Theme } from "../theme/useTheme";

/**
 * The frame strip — ONE component at two densities.
 *
 *   compact   the "NEXT 2 HOURS" panel on the verdict screen. 24 frames, read-only.
 *   expanded  the scrubber that drives the radar map. ~40 frames, interactive.
 *
 * They are not two components. The moment the strip and the scrubber are
 * separate files they start disagreeing about what a bar means — which height
 * curve, which colour, whether an unobserved frame is a gap — and the map ends
 * up contradicting the verdict it is supposed to confirm. `PrecipitationTimeline`
 * below is the whole of the difference: a density and two props.
 */
export type PrecipitationDensity = "compact" | "expanded";

export type PrecipitationGraphProps = {
  /** Frames in time order. A frame with negative `minutes` is an observation. */
  frames: Frame[];
  theme: Theme;
  density?: PrecipitationDensity;
  /** Interactive only when supplied — the compact strip simply does not pass it. */
  onScrub?: (index: number) => void;
  selectedIndex?: number;
  /** Overrides the caps header. */
  label?: string;
  /** Overrides the right-hand caption. */
  caption?: string;
};

/**
 * The rate at which a bar reaches full height.
 *
 * Pinned to the LAST band's floor rather than a chosen number, so height and
 * colour saturate at the same place by construction. The design comp used
 * `sqrt(rate / 6)`, which topped out at 6 mm/h while the palette kept climbing
 * through `heavy` and `torrential` — a 6 mm/h bar and a 20 mm/h bar were the
 * same height in different colours. Two encodings of one quantity that stopped
 * agreeing exactly where the weather got serious.
 */
export const HEIGHT_CEILING = BANDS[BANDS.length - 1].floor;

/** Height for a frame we looked at and found dry — present, but plainly nothing. */
const DRY_PCT = 4;
/** Floor for any wet frame, so band 1 never renders as indistinguishable from dry. */
const MIN_WET_PCT = 6;

/**
 * Cube root, not square root.
 *
 * It has to rise across the whole band range (see HEIGHT_CEILING) *and* keep the
 * low end readable — most Nordic rain is under 1 mm/h, and a linear scale would
 * flatten the entire useful range into the bottom 4 % of the strip.
 */
export function barHeight(rate: number): number {
  if (rate <= 0) return DRY_PCT;
  const t = Math.cbrt(Math.min(rate, HEIGHT_CEILING) / HEIGHT_CEILING);
  return Math.max(MIN_WET_PCT, Math.min(100, Math.round(t * 100)));
}

/**
 * Same hatch as `Swatch` in `blind` mode. "Not observed" has to look identical
 * everywhere it appears or it stops being a language and becomes a decoration.
 * `PrecipitationGraph.test.tsx` asserts the two strings still match.
 */

/** No `--font-mono` token exists yet; these micro-labels want one. */

const DENSITY = {
  compact: { stripHeight: 46, gap: 2, minBar: 3 },
  expanded: { stripHeight: 64, gap: 2, minBar: 4 },
} as const;

/** Rain is still falling in the last frame we have, so its end is unknown. */
export function isOpenEndedSeries(frames: Frame[]): boolean {
  return frames.length > 0 && isWet(frames[frames.length - 1]);
}

/** One word for the shape of the series, shown beside the header. */
export function shapeCaptionOf(frames: Frame[]): string {
  if (frames.length === 0) return "";
  if (frames.every(isBlind)) return "not observed";
  if (isOpenEndedSeries(frames)) return "runs past the horizon";
  if (isWet(frames[0])) return "easing";
  return frames.some(isWet) ? "one band" : "clear";
}

function atLabel(min: number): string {
  if (min === 0) return "now";
  // U+2212 minus, not a hyphen — these sit next to "+30" and have to line up.
  return min < 0 ? `−${-min} min` : `+${min} min`;
}

/**
 * Ticks derived from the frames rather than hardcoded, so the expanded density
 * (which carries observed history at negative minutes) labels itself correctly
 * without a second implementation.
 */
export function axisTicks(frames: Frame[]): string[] {
  if (frames.length === 0) return [];
  const first = frames[0].minutes;
  const last = frames[frames.length - 1].minutes;
  // The marker says the series does not end here, it just stops being visible.
  const end = isOpenEndedSeries(frames) ? `+${last} ⇥` : `+${last}`;
  if (first < 0) return [`−${-first} observed`, "now", `${end} forecast`];
  const out = ["now"];
  for (let m = 30; m < last; m += 30) out.push(`+${m}`);
  out.push(end);
  return out;
}

type Bar = {
  pct: number;
  /** Token classes, for the fills that are semantic rather than a band. */
  className?: string;
  /** Band colour, computed per rate — stays a value, never a class. */
  backgroundColor?: string;
  backgroundImage?: string;
  opacity: number;
  label: string;
};

function barOf(f: Frame, theme: Theme): Bar {
  // Blind first, always. `maxRate` is 0 for an unobserved frame, so falling
  // through would draw "we cannot see here" as a dry bar — the same conflation
  // `lib/radar.ts` exists to prevent, reintroduced at the last step.
  if (isBlind(f)) {
    return {
      pct: 100,
      className: "bg-nodata",
      backgroundImage: HATCH,
      opacity: 1,
      label: `${atLabel(f.minutes)} — not observed`,
    };
  }

  const band = bandOf(f.maxRate);
  const past = f.minutes < 0 ? 0.55 : 1;
  const label = `${atLabel(f.minutes)} — ${describeRate(f.maxRate)}`;

  if (band.index === 0) {
    return { pct: DRY_PCT, className: "bg-dry", opacity: past, label };
  }
  return {
    pct: barHeight(f.maxRate),
    backgroundColor: colorOf(band, theme),
    // Bands 1-2 are radar seeing damp air nobody would call rain. Drawn, because
    // it is real, but held back so it does not read as the forecast.
    opacity: past * (f.maxRate >= NOTICEABLE ? 1 : 0.85),
    label,
  };
}

function horizonFade(theme: Theme): string {
  return theme === "dark"
    ? "linear-gradient(90deg,rgba(236,238,240,.16),rgba(236,238,240,0))"
    : "linear-gradient(90deg,rgba(21,24,27,.13),rgba(21,24,27,0))";
}

export function PrecipitationGraph({
  frames,
  theme,
  density = "compact",
  onScrub,
  selectedIndex,
  label,
  caption,
}: PrecipitationGraphProps) {
  if (frames.length === 0) return null;

  const d = DENSITY[density];
  const openEnded = isOpenEndedSeries(frames);
  const ticks = axisTicks(frames);
  const header = label ?? (density === "compact" ? "NEXT 2 HOURS" : "RADAR TIMELINE");
  const selected = selectedIndex !== undefined ? frames[selectedIndex] : undefined;
  const right =
    caption ??
    (selected
      ? `${atLabel(selected.minutes)} · ${selected.minutes < 0 ? "observed" : "forecast"}`
      : shapeCaptionOf(frames));

  const micro = { fontFamily: MONO, fontSize: 9.5 } as const;

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        <Text className="text-ink3" style={[micro, { letterSpacing: 0.5 }]}>
          {header}
        </Text>
        <Text className="text-ink3" style={[micro, { letterSpacing: 0.3 }]}>
          {right}
        </Text>
      </View>

      <View
        accessibilityLabel={`Rain intensity ${ticks[0]} to ${ticks[ticks.length - 1]} — ${shapeCaptionOf(frames)}`}
        // Only an image when there is nothing to operate. `role="img"` hides
        // descendants from assistive tech, which would swallow the scrub buttons.
        role={onScrub ? undefined : "img"}
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: d.gap,
          height: d.stripHeight,
          // The open-ended marker deliberately overhangs; clipping would undo it.
          overflow: "visible",
        }}
      >
        {frames.map((f, i) => {
          const bar = barOf(f, theme);
          const style = {
            flex: 1,
            height: `${bar.pct}%` as DimensionValue,
            minHeight: d.minBar,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
            ...(bar.backgroundColor ? { backgroundColor: bar.backgroundColor } : null),
            opacity: bar.opacity,
            ...(bar.backgroundImage ? { backgroundImage: bar.backgroundImage } : null),
            ...(i === selectedIndex ? { outlineWidth: 2, outlineOffset: 1 } : null),
          } as object;

          // The selected bar's outline is ink; the semantic fills (not
          // observed, dry) are tokens. The band fills are values and stay in
          // `style` above.
          const barClass = [bar.className, i === selectedIndex ? "outline-ink" : null]
            .filter(Boolean)
            .join(" ");

          const key = `${f.minutes}`;
          // Non-interactive stays a View, not a disabled Pressable: the compact
          // strip must read as finished, not as a scrubber someone turned off.
          return onScrub ? (
            <Pressable
              key={key}
              testID="precip-bar"
              accessibilityRole="button"
              accessibilityLabel={bar.label}
              aria-selected={i === selectedIndex}
              onPress={() => onScrub(i)}
              className={barClass}
              style={style}
            >
              {bar.backgroundImage ? <Hatch size={d.stripHeight} /> : null}
            </Pressable>
          ) : (
            <View
              key={key}
              testID="precip-bar"
              accessibilityLabel={bar.label}
              className={barClass}
              style={style}
            >
              {bar.backgroundImage ? <Hatch size={d.stripHeight} /> : null}
            </View>
          );
        })}

        {openEnded ? (
          // Runs off the right edge on purpose. A strip that ends flush says the
          // rain ends; this one says our view of it does.
          <View
            testID="precip-overflow"
            accessibilityLabel="still raining when the forecast ends — no end visible"
            role="img"
            style={
              {
                flexGrow: 0,
                flexShrink: 0,
                width: 26,
                marginRight: -14,
                height: "100%",
                borderTopLeftRadius: 2,
                backgroundImage: horizonFade(theme),
              } as object
            }
          />
        ) : null}
      </View>

      <View className="bg-line2" style={{ height: 1, marginTop: 2 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
        {ticks.map((t) => (
          <Text key={t} className="text-ink3" style={[micro, { letterSpacing: 0.3 }]}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type PrecipitationTimelineProps = Omit<PrecipitationGraphProps, "density">;

/**
 * The phase-2 scrubber. Deliberately a wrapper and not a file of its own — if it
 * ever needs more than this, the extra behaviour belongs in the graph behind a
 * prop, so both densities keep getting it.
 */
export function PrecipitationTimeline(props: PrecipitationTimelineProps) {
  return <PrecipitationGraph {...props} density="expanded" />;
}
