import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

/**
 * The last row of the list: "+ Add a place", drawn as an empty slot.
 *
 * A DASHED CARD, NOT A BUTTON, and the difference is the point. It is the same
 * width, radius and padding as the rows above it, so it reads as the next place
 * in the list — one that has not been filled in yet. A solid button here would
 * read as a control that acts on the list; the dashed outline reads as a gap in
 * it, which is what adding a place actually is.
 *
 * That is also why it sits inside the list rather than under it, and why it is
 * left-aligned like a row rather than centred like an action.
 */
export type AddPlaceCardProps = {
  onPress: () => void;
  /** Two-pane's 350 px column steps everything down a size. */
  compact?: boolean;
};

export function AddPlaceCard({ onPress, compact = false }: AddPlaceCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      testID="add-place"
      accessibilityRole="button"
      accessibilityLabel={t("nav.addPlace")}
      onPress={onPress}
      className="border-line2"
      style={({ pressed }) => ({
        borderWidth: 1,
        borderStyle: "dashed",
        borderRadius: compact ? 10 : 12,
        paddingVertical: compact ? 13 : 16,
        paddingHorizontal: compact ? 14 : 17,
        // Transparent, not `bg-surface`: a filled card would look like a saved
        // place with a missing name.
        backgroundColor: "transparent",
        // Still 44 px of target even at the compact size, where the padding
        // alone does not get there.
        minHeight: 44,
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text className="text-ink2" style={{ fontSize: compact ? 13 : 14 }}>
        {t("nav.addPlace")}
      </Text>
    </Pressable>
  );
}
