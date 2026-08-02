import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";

/**
 * Primary / secondary / ghost, plus a destructive variant for Remove.
 *
 * Minimum 44x44 hit area on every variant — the design comp had 30px targets,
 * which is below the threshold for a thumb.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Fill the width of its container — used for the primary action in forms. */
  block?: boolean;
  accessibilityHint?: string;
  children?: ReactNode;
};

const MIN_TARGET = 44;

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  block = false,
  accessibilityHint,
}: ButtonProps) {
  const palette = {
    primary: { bg: "var(--color-ink)", fg: "var(--color-bg)", border: "var(--color-ink)" },
    secondary: { bg: "transparent", fg: "var(--color-ink)", border: "var(--color-line2)" },
    ghost: { bg: "transparent", fg: "var(--color-ink2)", border: "transparent" },
    // Destructive is *outlined*, not filled: a filled red button is easy to hit
    // by accident, and deletion here is unrecoverable.
    destructive: { bg: "transparent", fg: "var(--color-danger)", border: "var(--color-danger)" },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
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
    </Pressable>
  );
}
