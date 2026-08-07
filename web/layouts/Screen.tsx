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
 * The growth is the point — extra viewport goes to margin, not to a longer
 * line, and a verdict set 24 px from the top of a 1400 px window reads like a
 * document that failed to load rather than like an answer. It pairs with the
 * measure cap: the cap stops the line growing, this stops the page feeling
 * empty because of it.
 *
 * TOP AND HORIZONTAL ARE SHARED ACROSS THE READING SCREENS; only the bottom
 * differs, which is why it is a parameter below. Verdict, About and Add all use
 * `14/30/48` down the top and `22/40/64` at the sides in their own design
 * files, and then choose their own floor.
 *
 * These were `18/24/10 · 40/44/26 · 62/72/34` — round ONE's `padV`, taken from
 * the only design file that was checked in at the time. Every number moved in a
 * later round. The reasoning in that commit was right and its source was stale,
 * which is the failure mode this whole alignment pass exists to clear up.
 *
 * Only the reading screens take this. The two-pane LIST pane is a 350 px column
 * with its own much tighter padding, and 64 px of gutter inside it would leave
 * nowhere to put a place name.
 */
export const PAGE_PAD = {
  phone: { top: 14, horizontal: 22, bottom: 18 },
  tablet: { top: 30, horizontal: 40, bottom: 26 },
  desktop: { top: 48, horizontal: 64, bottom: 34 },
} as const;

export type PagePad = { top: number; horizontal: number; bottom: number };

/**
 * Which padding step a viewport width earns.
 *
 * `bottom` overrides the floor for screens whose design file names a different
 * one — About sits on `30/34/44`, Add on `26/30/40`. The top and the sides are
 * not negotiable: they are what make the reading screens feel like one app.
 */
export function pagePadFor(width: number, bottom?: [number, number, number]): PagePad {
  const step = width < 768 ? 0 : width < 1100 ? 1 : 2;
  const base = [PAGE_PAD.phone, PAGE_PAD.tablet, PAGE_PAD.desktop][step];
  return bottom ? { ...base, bottom: bottom[step] } : base;
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
