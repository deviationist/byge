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
      <Text className="text-ink2" style={{ fontSize: 22, lineHeight: 24 }}>
        {glyph}
      </Text>
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
        // Above everything that follows it, because `trailing` is where the
        // overflow menu lives and its panel hangs down over the content below.
        //
        // This is not belt-and-braces on top of the panel's own z-index — it is
        // the only thing that works. react-native-web gives EVERY View
        // `position: relative; z-index: 0`, and a positioned element with a
        // numeric z-index creates a stacking context. So the panel's z-index of
        // 50 is sealed inside its own wrapper and can never outrank anything
        // outside it. What competes with the headline is this bar, at 0, losing
        // the tie to a later sibling on DOM order. The menu rendered *under* the
        // verdict text, which reads as a transparent menu rather than a
        // misordered one.
        zIndex: 20,
      }}
    >
      {onBack ? <NavBarButton onPress={onBack} label={backLabel ?? "Back"} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {trailing}
    </View>
  );
}
