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
 * The design's page padding, which is nothing like a constant.
 *
 * Measured off the specimen: `18/24/10` on phone, `40/44/26` on tablet,
 * `62/72/34` on desktop. The growth is the point — extra viewport goes to
 * margin, not to a longer line, and a verdict set 24 px from the top of a
 * 1400 px window reads like a document that failed to load rather than like an
 * answer. It pairs with the measure cap: the cap stops the line growing, this
 * stops the page feeling empty because of it.
 *
 * Only the reading screens take this. The two-pane LIST pane is a 350 px column
 * with its own much tighter padding, and 72 px of gutter inside it would leave
 * nowhere to put a place name.
 */
export const PAGE_PAD = {
  phone: { top: 18, horizontal: 24, bottom: 10 },
  tablet: { top: 40, horizontal: 44, bottom: 26 },
  desktop: { top: 62, horizontal: 72, bottom: 34 },
} as const;

export type PagePad = (typeof PAGE_PAD)[keyof typeof PAGE_PAD];

/** Which padding step a viewport width earns. */
export function pagePadFor(width: number): PagePad {
  if (width < 768) return PAGE_PAD.phone;
  if (width < 1100) return PAGE_PAD.tablet;
  return PAGE_PAD.desktop;
}

/**
 * calc() rather than a bare env(): the inset is *additional* to the page
 * padding. A bare env() would collapse the padding to zero on every device
 * without a notch, which is most of them.
 *
 * Cast because React Native types padding as a number and knows nothing about
 * CSS functions — react-native-web passes string values straight through.
 */
function safeAreaPadding(pad: { top: number; horizontal: number; bottom: number }) {
  return {
    paddingTop: `calc(${pad.top}px + env(safe-area-inset-top))`,
    paddingBottom: `calc(${pad.bottom}px + env(safe-area-inset-bottom))`,
    paddingLeft: `calc(${pad.horizontal}px + env(safe-area-inset-left))`,
    paddingRight: `calc(${pad.horizontal}px + env(safe-area-inset-right))`,
  } as object;
}

const DEFAULT_PAD = { top: PAD_V, horizontal: PAD_H, bottom: PAD_V };

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
  /**
   * Page padding. Defaults to the tight uniform value the list panes want;
   * reading screens pass `pagePadFor(width)` for the design's growing gutter.
   */
  pad?: { top: number; horizontal: number; bottom: number };
  testID?: string;
};

export function Screen({
  children,
  measure = MEASURE,
  gap,
  pad = DEFAULT_PAD,
  testID,
}: ScreenProps) {
  return (
    <View testID={testID} className="bg-bg" style={[{ flex: 1 }, safeAreaPadding(pad)]}>
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
