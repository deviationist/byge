import { Text, View } from "react-native";
import {
  type Confidence,
  confidenceOf,
  isBlindVerdict,
  leadMin,
  type Verdict,
} from "../lib/forecast";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";

/**
 * Three bars and a sentence fragment: "high confidence · reading now".
 *
 * The second half is the load-bearing part. `confidence` keys off the lead time
 * of the thing being *predicted*, so "high" can mean either "we are reading the
 * radar right now" or "the claim is only 20 minutes out" — and those deserve
 * different trust. Showing the level without saying what it applies to turns a
 * hedge into a badge.
 *
 * Nothing here is coloured by band. Confidence is not an intensity, and tinting
 * it with the precipitation ramp would make a torrential forecast look more
 * certain than a drizzle one. Hence `theme` is accepted for API symmetry with
 * the other precipitation components but never consulted — the ink tokens flip
 * themselves.
 */
export type PrecipitationConfidenceProps = {
  verdict: Verdict;
  theme: Theme;
};

const FILLED: Record<Confidence, number> = { high: 3, moderate: 2, low: 1 };

/** What the confidence is a statement *about*. */
export function confidenceSubject(v: Verdict): string {
  if (v.rainingNow) return "reading now";
  if (v.next) return `+${leadMin(v)} min out`;
  return "clear field";
}

export function PrecipitationConfidence({ verdict }: PrecipitationConfidenceProps) {
  // A blind location has nothing to be confident about. Rendering "high
  // confidence" beside "we cannot see this place" would read as confidence in
  // the non-answer.
  if (isBlindVerdict(verdict)) return null;

  const level = confidenceOf(verdict);
  const n = FILLED[level];
  const text = `${level} confidence · ${confidenceSubject(verdict)}`;

  return (
    <View
      accessibilityLabel={text}
      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <View style={{ flexDirection: "row", gap: 3 }} testID="confidence-bars">
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            testID={i <= n ? "confidence-bar-on" : "confidence-bar-off"}
            className={i <= n ? "bg-ink2" : "bg-line2"}
            style={{
              width: 14,
              height: 3,
              borderRadius: 2,
            }}
          />
        ))}
      </View>
      <Text
        className="text-ink2"
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 0.3,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
