import { Pressable, Text, View } from "react-native";
import type { Verdict } from "../lib/forecast";
import type { Theme } from "../theme/useTheme";
import { Location } from "./Location";
import { LocationStatusText, statusLine } from "./LocationStatusText";
import { Swatch, swatchModeOf, swatchRateOf } from "./Swatch";

/**
 * A saved place and its answer — the list row, and the map marker popup.
 *
 * ONE component, two placements. The popup is not a smaller card with a
 * different sentence in it; it is this card, so a place cannot read as
 * "Raining" in the list and something else on the map.
 *
 * The swatch is decoration in the strict sense: it repeats what the status line
 * already says in words. That is deliberate — colour never carries information
 * on its own here, so a colour-blind reader loses nothing by ignoring it.
 */
export type LocationCardVariant = "row" | "popup";

export type LocationCardProps = {
  name: string;
  place?: string;
  lat?: number;
  lon?: number;
  verdict: Verdict;
  theme: Theme;
  variant?: LocationCardVariant;
  /** Highlighted as the current selection in a two-pane layout. */
  selected?: boolean;
  onPress?: () => void;
};

/** Below this a thumb misses. The design comp had 30px targets. */
const MIN_TARGET = 44;

export function LocationCard({
  name,
  place,
  lat,
  lon,
  verdict,
  theme,
  variant = "row",
  selected = false,
  onPress,
}: LocationCardProps) {
  const isRow = variant === "row";
  const status = statusLine(verdict);

  // Derived, never reimplemented — the swatch's meaning is defined once in
  // Swatch.tsx and four call sites depend on it agreeing.
  const mode = swatchModeOf(verdict);
  const rate = swatchRateOf(verdict);

  const body = (
    <>
      <Swatch mode={mode} rate={rate} size={isRow ? 13 : 12} theme={theme} />

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Location
          name={name}
          place={place}
          lat={lat}
          lon={lon}
          theme={theme}
          variant={isRow ? "row" : "popup"}
        />
        <LocationStatusText verdict={verdict} theme={theme} variant="compact" />
      </View>

      {isRow ? (
        // Affordance only. The row already announces itself as a button.
        <Text aria-hidden className="text-ink3" style={{ fontSize: 15 }}>
          ›
        </Text>
      ) : null}
    </>
  );

  // Selection is a surface change, not an accent: the selected row sinks to
  // bg-sunk with a firmer hairline rather than taking a colour of its own.
  const frameClass = selected ? "bg-sunk border-line2" : "bg-surface border-line";

  const frame = {
    flexDirection: "row" as const,
    alignItems: isRow ? ("center" as const) : ("flex-start" as const),
    gap: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: isRow ? 14 : 11,
    paddingHorizontal: isRow ? 17 : 13,
    minHeight: MIN_TARGET,
  };

  const popup = isRow
    ? null
    : {
        minWidth: 190,
        // Tokenised rather than a raw rgba so the lift stays right on dark,
        // where a black shadow is invisible and a light one is wrong.
        //
        // The one place a var() legitimately stays inline: `boxShadow` does not
        // exist in React Native at all — it uses shadowColor/elevation — so this
        // declaration is web-only by nature and there is no native reader to
        // hand an unresolvable string to.
        boxShadow: "0 8px 22px -8px var(--color-scrim)",
      };

  // The full sentence, not "Home" — a screen-reader user should not have to
  // enter the row to find out whether it is raining there.
  const label = `${name}${place ? `, ${place}` : ""}. ${status}`;

  if (!onPress) {
    return (
      <View
        testID="location-card"
        accessibilityLabel={label}
        className={frameClass}
        style={[frame, popup]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID="location-card"
      accessibilityRole="button"
      accessibilityLabel={label}
      // `aria-selected`, not `accessibilityState={{selected}}` — react-native-web
      // drops the latter entirely, so the selection would be visual only.
      // (`aria-current` would be the better fit for a master-detail row, but it
      // is not in React Native's typed aria surface.)
      aria-selected={selected}
      onPress={onPress}
      className={frameClass}
      style={({ pressed }) => [frame, popup, pressed ? { opacity: 0.7 } : null]}
    >
      {body}
    </Pressable>
  );
}
