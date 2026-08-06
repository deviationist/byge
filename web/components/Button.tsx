import { forwardRef, type ReactNode } from "react";
import { Pressable, Text, type View } from "react-native";

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

/**
 * Ref-forwarding so a caller can move focus onto a specific button — which
 * ConfirmSheet needs to land focus on the safe option when it opens. Same
 * pattern as MoreButton.
 */
export const Button = forwardRef<View, ButtonProps>(function Button(
  { label, onPress, variant = "primary", disabled = false, block = false, hint },
  ref,
) {
  const hintId = hint ? `byge-btn-hint-${++hintSeq}` : undefined;
  // Colour via className so Uniwind compiles it for web AND native. An inline
  // `var(--…)` only resolves in a browser: on native it reaches a view with no
  // CSS engine, and Uniwind never sees it because it only reads className.
  const palette = {
    primary: { box: "bg-ink border-ink", text: "text-bg" },
    secondary: { box: "bg-transparent border-line2", text: "text-ink" },
    ghost: { box: "bg-transparent border-transparent", text: "text-ink2" },
  }[variant];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-describedby={hintId}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={palette.box}
      style={({ pressed }) => [
        {
          minHeight: MIN_TARGET,
          paddingHorizontal: 20,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 10,
          borderWidth: 1,
          // Numbers stay inline: a computed press/disabled state has no static
          // class, and numbers cross to native untouched.
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        block ? { alignSelf: "stretch" } : { alignSelf: "flex-start" },
      ]}
    >
      <Text className={palette.text} style={{ fontSize: 15, fontWeight: "500" }}>
        {label}
      </Text>
      {hint ? (
        <Text nativeID={hintId} style={OFFSCREEN}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
});
