import { forwardRef } from "react";
import { Pressable, Text, type View } from "react-native";

/**
 * The menu trigger.
 *
 * Edit and Remove live on the verdict screen, but that screen's whole job is to
 * state one sentence honestly. Two labelled buttons in the bar compete with the
 * headline for attention, so the actions collapse behind a single glyph and the
 * sentence keeps the screen.
 *
 * The glyph is meaningless to a screen reader, so the accessible name is not
 * optional — it defaults to "More actions" and is never blank. `expanded` is
 * mirrored into `aria-expanded` explicitly: react-native-web does NOT translate
 * `accessibilityState.expanded` into an attribute (verified against this
 * version), so relying on it would silently ship a trigger that never announces
 * whether its menu is open.
 *
 * Optional `text` turns the 44x44 icon button into a labelled dropdown trigger.
 * That is what lets OverflowMenu serve a plain dropdown as well — one trigger,
 * two shapes, rather than a second near-identical component.
 */
export type MoreButtonProps = {
  onPress?: () => void;
  /** Drives `aria-expanded`. Pass the menu's open state. */
  expanded?: boolean;
  /** Accessible name. Also the visible label when `text` is set. */
  label?: string;
  /** Visible text, for the labelled-dropdown shape. Omit for the bare glyph. */
  text?: string;
  glyph?: string;
  disabled?: boolean;
  accessibilityHint?: string;
};

const MIN_TARGET = 44;

export const MoreButton = forwardRef<View, MoreButtonProps>(function MoreButton(
  {
    onPress,
    expanded = false,
    label = "More actions",
    text,
    glyph = "⋯",
    disabled = false,
    accessibilityHint,
  },
  ref,
) {
  const labelled = text !== undefined;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={labelled ? undefined : label}
      accessibilityHint={accessibilityHint}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth: MIN_TARGET,
          minHeight: MIN_TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: 10,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        labelled
          ? {
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: "var(--color-line2)",
              backgroundColor: "var(--color-surface)",
            }
          : null,
      ]}
    >
      {labelled ? (
        <Text style={{ fontSize: 14, color: "var(--color-ink)" }}>{text}</Text>
      ) : null}
      <Text
        style={{
          fontSize: labelled ? 12 : 20,
          lineHeight: labelled ? 14 : 22,
          color: "var(--color-ink2)",
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
});
