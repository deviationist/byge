import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";

/**
 * Primary / secondary / ghost.
 *
 * There is deliberately NO destructive variant. Nothing else in byge uses alarm
 * colour — the blues are data — so a lone red button reads as an error rather
 * than a choice. Destructive actions get primary weight and carry their caution
 * in the wording instead ("Remove Cabin", not "OK"), always behind a
 * ConfirmSheet.
 *
 * Minimum 44x44 hit area on every variant — the design comp had 30px targets,
 * which is below the threshold for a thumb.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Fill the width of its container — used for the primary action in forms. */
  block?: boolean;
  /**
   * Extra context for assistive tech, e.g. "cannot be undone".
   *
   * NOT passed as `accessibilityHint`: that prop does not exist in
   * react-native-web's implementation at all (grep its dist — zero hits), so it
   * type-checks, looks wired, and reaches nobody. It is rendered as an
   * off-screen node and referenced by `aria-describedby` instead.
   */
  hint?: string;
  children?: ReactNode;
};

const MIN_TARGET = 44;

/** Available to assistive tech, absent from the visual layout. */
const OFFSCREEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
} as const;

let hintSeq = 0;

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  block = false,
  hint,
}: ButtonProps) {
  const hintId = hint ? `byge-btn-hint-${++hintSeq}` : undefined;
  const palette = {
    primary: { bg: "var(--color-ink)", fg: "var(--color-bg)", border: "var(--color-ink)" },
    secondary: { bg: "transparent", fg: "var(--color-ink)", border: "var(--color-line2)" },
    ghost: { bg: "transparent", fg: "var(--color-ink2)", border: "transparent" },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-describedby={hintId}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TARGET,
          paddingHorizontal: 20,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 10,
          borderWidth: 1,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        block ? { alignSelf: "stretch" } : { alignSelf: "flex-start" },
      ]}
    >
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: "500" }}>{label}</Text>
      {hint ? (
        <Text nativeID={hintId} style={OFFSCREEN}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}
