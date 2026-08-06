import { Pressable, Text, View } from "react-native";
import type { Verdict } from "../lib/forecast";
import type { Theme } from "../theme/useTheme";
import { Location } from "./Location";
import { LocationStatusText, statusLine } from "./LocationStatusText";
import { SWATCH, Swatch, swatchModeOf, swatchRateOf } from "./Swatch";

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
  /**
   * Absent while the first fetch is still in flight.
   *
   * The row stays on screen without it. Dropping rows until their verdict
   * arrives makes a person's saved places vanish on a slow network and shows
   * the first-run welcome in their place — which reads as "everything is gone"
   * rather than "still loading".
   */
  verdict?: Verdict;
  theme: Theme;
  variant?: LocationCardVariant;
  /** Highlighted as the current selection in a two-pane layout. */
  selected?: boolean;
  /**
   * The two-pane list is a 300 px column, so the row steps down a size — and
   * loses its chevron, because a row that swaps the pane beside it is not
   * navigating anywhere. Same row, two sizes; not a third variant.
   */
  compact?: boolean;
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
  compact = false,
  onPress,
}: LocationCardProps) {
  const isRow = variant === "row";
  const status = verdict ? statusLine(verdict) : "Checking\u2026";

  // Derived, never reimplemented — the swatch's meaning is defined once in
  // Swatch.tsx and four call sites depend on it agreeing.
  const mode = verdict ? swatchModeOf(verdict) : "dry";
  const rate = verdict ? swatchRateOf(verdict) : 0;

  const tight = isRow && compact;

  const body = (
    <>
      <Swatch
        mode={mode}
        rate={rate}
        size={isRow ? (tight ? SWATCH.rowCompact : SWATCH.row) : SWATCH.popup}
        theme={theme}
      />

      <View style={{ flex: 1, minWidth: 0, gap: tight ? 3 : 4 }}>
        <Location
          name={name}
          place={place}
          lat={lat}
          lon={lon}
          theme={theme}
          variant={isRow ? "row" : "popup"}
        />
        {verdict ? (
          <LocationStatusText verdict={verdict} theme={theme} variant="compact" />
        ) : (
          <Text className="text-ink3" style={{ fontSize: tight ? 12.5 : 13.5, lineHeight: 18 }}>
            {status}
          </Text>
        )}
      </View>

      {isRow && !tight ? (
        // Affordance only — the row already announces itself as a button. Absent
        // in the compact column because there it swaps the pane beside it rather
        // than pushing a screen, and a chevron would promise navigation.
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
    gap: tight ? 12 : 14,
    borderRadius: tight ? 10 : 12,
    borderWidth: 1,
    paddingVertical: isRow ? (tight ? 13 : 16) : 11,
    paddingHorizontal: isRow ? (tight ? 14 : 17) : 13,
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
