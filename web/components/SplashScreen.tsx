import { View } from "react-native";
import type { Theme } from "../theme/useTheme";
import { BrandMark } from "./BrandMark";

/**
 * A doorway, not a wait.
 *
 * There is deliberately nothing here that needs finishing: no wordmark, no
 * animation, no progress bar, no spinner. A progress indicator is a promise
 * about duration, and this screen has no idea how long anything will take —
 * a spinner that sits still reads as a failure, which is exactly the wrong
 * first impression for an app whose one job is to be trusted.
 *
 * The background is the manifest's `background_color` per scheme (#F6F4F0 /
 * #0E1113) so the handoff from the OS-drawn splash to this one is invisible.
 *
 * Those are LITERAL HEX, not `var(--color-bg)`, even though the values match.
 * The dark palette is applied by toggling a `.dark` class on the document root
 * in an effect, i.e. *after* first paint — so a dark-scheme user would get one
 * frame of light background on the exact screen whose job is to have no seam.
 * The resolved `theme` prop has the answer before paint; the CSS variable does
 * not.
 */
export type SplashScreenProps = {
  theme: Theme;
  size?: number;
};

/** Kept next to its use so a manifest edit has one obvious counterpart. */
export const MANIFEST_BACKGROUND: Record<Theme, string> = {
  light: "#F6F4F0",
  dark: "#0E1113",
};

export function SplashScreen({ theme, size = 96 }: SplashScreenProps) {
  return (
    <View
      accessibilityLabel="byge"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: MANIFEST_BACKGROUND[theme],
      }}
    >
      <BrandMark size={size} theme={theme} />
    </View>
  );
}
