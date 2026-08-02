import { Text, View } from "react-native";
import type { Theme } from "../theme/useTheme";
import { BrandMark } from "./BrandMark";
import { Button } from "./Button";

/**
 * "Add byge to your home screen."
 *
 * NEVER OVER THE VERDICT. This renders in normal flow — no Modal, no absolute
 * or fixed positioning, no scrim. The answer to "is it raining on me" is the
 * only reason anyone opened the app, and an install nag that covers it trades
 * the product's whole purpose for an install. It sits above or below the
 * verdict and can be scrolled past.
 *
 * Dismissible, and the dismissal is the caller's to remember — this component
 * holds no state, so "Not now" cannot come back on the next render.
 *
 * The offline claim in the copy is a real one: with a service worker and a
 * cached verdict, byge still answers. It is the honest reason to install, so it
 * is the reason given.
 */
export type InstallPromptProps = {
  onInstall: () => void;
  onDismiss: () => void;
  theme: Theme;
};

export function InstallPrompt({ onInstall, onDismiss, theme }: InstallPromptProps) {
  return (
    <View
      style={{
        // `position` is stated rather than left to the default so that the
        // no-overlay rule is visible here and asserted in the test.
        position: "relative",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 14,
        backgroundColor: "var(--color-surface)",
        borderWidth: 1,
        borderColor: "var(--color-line)",
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <BrandMark size={30} theme={theme} />
      <Text
        style={{
          flex: 1,
          minWidth: 180,
          fontSize: 12.5,
          lineHeight: 19,
          color: "var(--color-ink2)",
        }}
      >
        Keep byge one tap away — add it to your home screen. Works offline with the last
        verdict.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {/* Both buttons inherit Button's 44px minimum. The comp drew 6px-padded
            30px chips; a dismiss you keep missing is worse than no dismiss. */}
        <Button label="Not now" variant="secondary" onPress={onDismiss} />
        <Button label="Add" onPress={onInstall} />
      </View>
    </View>
  );
}
