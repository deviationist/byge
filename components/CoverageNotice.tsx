import { Text, View } from "react-native";
import type { Theme } from "../theme/useTheme";
import { Swatch } from "./Swatch";

/**
 * What the radar could and could not see.
 *
 * Two genuinely different notices, and collapsing them would lose the more
 * important one:
 *
 *   blind    observed === 0. The mosaic does not reach here at all. Saying
 *            "dry" would be the most confident wrong answer byge is capable
 *            of producing, so the notice says outright that "we cannot see"
 *            is not "it is not raining".
 *   partial  0 < observed < 1. Some of the circle is outside coverage. The
 *            verdict is real but drawn from less area than was asked for, and
 *            the missing part counts neither as wet nor as dry.
 *
 * Partial is not an edge case: any coastal or border location with a wide
 * radius lands here.
 *
 * The copy mirrors `describe()` in lib/forecast.ts on purpose. One wording for
 * one fact — if the screen and the CLI drift apart, one of them is wrong.
 */
export type CoverageForm = "blind" | "partial" | "full";

export type CoverageNoticeProps = {
  /** `Verdict.observed` — fraction of the radius the radar can see. */
  observed: number;
  theme: Theme;
};

/**
 * `blind` here must stay exactly `isBlindVerdict()` in lib/forecast.ts —
 * `observed === 0`, not a threshold. A location the radar barely clips is
 * partial, and gets a verdict; only a total absence of observation is blind.
 */
export function coverageFormOf(observed: number): CoverageForm {
  if (observed === 0) return "blind";
  if (observed < 1) return "partial";
  return "full";
}

/**
 * Rounded percentage, clamped away from both ends.
 *
 * Both clamps guard a specific lie. `Math.round(0.004 * 100)` is 0, which would
 * print "Radar sees only 0% of your area" for a location that is *not* blind.
 * `Math.round(0.999 * 100)` is 100, which would print full coverage on a
 * partial one and quietly retract the whole notice.
 */
export function observedPercent(observed: number): number {
  return Math.min(99, Math.max(1, Math.round(observed * 100)));
}

export function CoverageNotice({ observed, theme }: CoverageNoticeProps) {
  const form = coverageFormOf(observed);
  if (form === "full") return null;

  const blind = form === "blind";

  return (
    <View
      role="note"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        backgroundColor: "var(--color-surface)",
        borderWidth: 1,
        borderColor: blind ? "var(--color-nodata-line)" : "var(--color-line2)",
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 15,
      }}
    >
      {/* The hatched swatch is the same glyph the list and the map use for
          "not observed", so the notice and the row agree at a glance. Shape,
          not colour, is what carries it. */}
      <View style={{ paddingTop: 2 }}>
        <Swatch mode="blind" size={14} theme={theme} />
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        {blind ? (
          <>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 14, lineHeight: 20, color: "var(--color-ink)" }}
            >
              No radar coverage — we cannot see this place.
            </Text>
            {/* The single most important sentence in this component. Without it
                a reader fills the silence with "so it must be fine". */}
            <Text style={{ fontSize: 12.5, lineHeight: 20, color: "var(--color-ink2)" }}>
              That is not the same as dry: we have no observation at all, so byge makes no claim
              either way.
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 12.5, lineHeight: 20, color: "var(--color-ink2)" }}>
            Radar sees only {observedPercent(observed)}% of your area — the rest is outside
            coverage and not included either way.
          </Text>
        )}
      </View>
    </View>
  );
}
