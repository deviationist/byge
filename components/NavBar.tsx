import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

const MIN_TARGET = 44;

/**
 * The caret back button.
 *
 * 44x44 rather than the comp's 30x30 — below 44 a thumb misses, and this is the
 * control someone hits one-handed while walking.
 */
export function NavBarButton({
  onPress,
  label = "Back",
  glyph = "‹",
}: {
  onPress?: () => void;
  label?: string;
  glyph?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: MIN_TARGET,
        height: MIN_TARGET,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 22, lineHeight: 24, color: "var(--color-ink2)" }}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * Back button left, content slot right filling the remainder.
 *
 * `onBack` is optional so the same bar serves root screens, which have no back
 * target — the slot then starts at the leading edge rather than leaving a hole.
 */
export function NavBar({
  onBack,
  backLabel,
  children,
  trailing,
}: {
  onBack?: () => void;
  backLabel?: string;
  children?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: MIN_TARGET + 8,
      }}
    >
      {onBack ? <NavBarButton onPress={onBack} label={backLabel ?? "Back"} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {trailing}
    </View>
  );
}
