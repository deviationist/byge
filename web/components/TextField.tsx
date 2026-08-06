import i18next from "i18next";
import { useId } from "react";
import type { KeyboardTypeOptions, TextStyle } from "react-native";
import { MONO } from "../theme/tokens";
import { Text, TextInput, View } from "react-native";
import { clampCoord } from "../lib/grid";

/**
 * Label, value, hint, error.
 *
 * The label is a real element wired to the input with `aria-labelledby`, not a
 * placeholder. A placeholder disappears the moment someone starts typing, which
 * is exactly when they most need to know which of two identical-looking
 * coordinate boxes they are in.
 *
 * There is no alarm colour in byge — the blues are data — so the error state is
 * carried by a heavier border, full-strength ink, and the words themselves,
 * plus `aria-invalid` and a live `role="alert"`. Colour is never the only
 * channel, here because there isn't a colour to spare.
 */
export type TextFieldVariant = "text" | "coordinate";

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Standing explanation. Always visible — this is not tooltip material. */
  hint?: string;
  /** Present means invalid. Announced, not just coloured. */
  error?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** `coordinate` clamps to 4 decimals on blur and defaults to the MET hint. */
  variant?: TextFieldVariant;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onBlur?: () => void;
  editable?: boolean;
  testID?: string;
};

/**
 * react-native-web forwards these to the DOM (they are in its `forwardedProps`
 * table) but they are absent from React Native's TypeScript surface, so they
 * can only be passed through a cast. Spelled out as a type rather than `any` so
 * a misspelt attribute still fails the build.
 */
type WebProps = { "aria-describedby"?: string; "aria-invalid"?: boolean };
const web = (p: WebProps) => p as object;

const MIN_TARGET = 44;

/**
 * Why the coordinate field truncates rather than just complaining.
 *
 * MET answers 403 to anything finer than 4 decimals, so a paste of
 * "59.927312" is a failed request rather than a slightly-too-precise one. Four
 * decimals is ~11 m, which is a hundredth of a 1 km radar cell — there is
 * nothing to lose by rounding and a whole request to lose by not.
 */
// A function, not a constant: a constant would call t() at import time, before
// i18n is initialised, and freeze English into a value the language switch
// could never reach.
export const coordHint = () => i18next.t("field.coordHint");

const LABEL: TextStyle = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const NOTE: TextStyle = {
  fontFamily: MONO,
  fontSize: 10,
  lineHeight: 16,
};

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  placeholder,
  keyboardType,
  variant = "text",
  autoCapitalize,
  onBlur,
  editable = true,
  testID,
}: TextFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const coordinate = variant === "coordinate";
  const shownHint = hint ?? (coordinate ? coordHint() : undefined);
  const invalid = error != null && error !== "";

  // Error first: if the field is wrong, that is the thing to hear before the
  // explanation of the format.
  const describedBy = [invalid ? errorId : null, shownHint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  function handleBlur() {
    if (coordinate) {
      const n = Number.parseFloat(value);
      // Only rewrite when clamping actually moves the number. Reformatting
      // "59.9000" to "59.9" would feel like the field arguing with you, and a
      // half-typed "" or "-" has to survive untouched.
      if (Number.isFinite(n)) {
        const clamped = clampCoord(n);
        if (clamped !== n) onChangeText(String(clamped));
      }
    }
    onBlur?.();
  }

  return (
    <View style={{ gap: 9 }}>
      <Text nativeID={labelId} className="text-ink3" style={LABEL}>
        {label}
      </Text>

      <TextInput
        nativeID={id}
        testID={testID}
        aria-labelledby={labelId}
        {...web({
          "aria-describedby": describedBy || undefined,
          "aria-invalid": invalid || undefined,
        })}
        value={value}
        onChangeText={onChangeText}
        onBlur={handleBlur}
        editable={editable}
        placeholder={placeholder}
        // Nordic coordinates are all positive, and `decimal-pad` is the only
        // inputmode that reliably offers a decimal separator on a phone.
        keyboardType={keyboardType ?? (coordinate ? "decimal-pad" : "default")}
        autoCapitalize={autoCapitalize ?? (coordinate ? "none" : "sentences")}
        // The invalid border is a *weight* change into full-strength ink. A red
        // here would be the only alarm colour in the app and would read as a
        // system fault rather than "check this number".
        className={`bg-surface text-ink `}
        style={{
          minHeight: MIN_TARGET,
          paddingHorizontal: 15,
          paddingVertical: 13,
          borderWidth: 1,
          borderRadius: 10,
          ...(coordinate ? { fontFamily: MONO, fontSize: 14 } : { fontSize: 15 }),
        }}
      />

      {invalid ? (
        <Text nativeID={errorId} role="alert" className="text-ink" style={NOTE}>
          {error}
        </Text>
      ) : null}

      {shownHint ? (
        <Text nativeID={hintId} className="text-ink3" style={NOTE}>
          {shownHint}
        </Text>
      ) : null}
    </View>
  );
}
