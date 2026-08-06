import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * Page padding, safe-area insets, and the reading measure.
 *
 * **The measure is the point.** byge's answer is a sentence — "Raining. Stops
 * in about 25 min." — and a sentence set across a 1400px desktop window is
 * unreadable: the eye loses the line on the return sweep. So extra width goes
 * to whitespace, not to longer lines. On a phone the cap is inert (no phone is
 * 620px wide), which is why it can be applied unconditionally rather than
 * behind a breakpoint.
 *
 * Safe-area insets come from CSS `env()` rather than
 * `react-native-safe-area-context`: byge ships as a web PWA, `env()` is what
 * the browser actually exposes, and the context package is only present in this
 * tree as somebody else's transitive dependency — not something to build on
 * without declaring it.
 */
export const MEASURE = 620;

const PAD_H = 20;
const PAD_V = 24;

/**
 * calc() rather than a bare env(): the inset is *additional* to the page
 * padding. A bare env() would collapse the padding to zero on every device
 * without a notch, which is most of them.
 *
 * Cast because React Native types padding as a number and knows nothing about
 * CSS functions — react-native-web passes string values straight through.
 */
const SAFE_AREA_PADDING = {
  paddingTop: `calc(${PAD_V}px + env(safe-area-inset-top))`,
  paddingBottom: `calc(${PAD_V}px + env(safe-area-inset-bottom))`,
  paddingLeft: `calc(${PAD_H}px + env(safe-area-inset-left))`,
  paddingRight: `calc(${PAD_H}px + env(safe-area-inset-right))`,
} as object;

export type ScreenProps = {
  children?: ReactNode;
  /**
   * Reading measure in px. `null` opts out for full-bleed surfaces — the map is
   * the one thing that legitimately wants the whole viewport, since it is a
   * field to pan rather than a line to read.
   */
  measure?: number | null;
  /** Vertical rhythm between direct children. */
  gap?: number;
  testID?: string;
};

export function Screen({ children, measure = MEASURE, gap, testID }: ScreenProps) {
  return (
    <View testID={testID} className="bg-bg" style={[{ flex: 1 }, SAFE_AREA_PADDING]}>
      <View
        testID={testID ? `${testID}-measure` : undefined}
        style={[
          { flex: 1, width: "100%", alignSelf: "center" },
          gap === undefined ? null : { gap },
          measure === null ? null : { maxWidth: measure },
        ]}
      >
        {children}
      </View>
    </View>
  );
}
