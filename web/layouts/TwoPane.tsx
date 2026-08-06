import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";

/**
 * List beside detail on tablet and desktop; a single column on phone.
 *
 * On phone it renders **one** side, and the caller says which. TwoPane
 * deliberately does not guess: the router already knows whether the user is on
 * `/` or `/location/[id]`, and a layout that infers it from "is detail null"
 * gets it wrong on exactly the case that matters — coming back from a deleted
 * location, where the detail slot is populated but the list is what should
 * show.
 *
 * The unused slot is not rendered at all rather than hidden. A hidden pane
 * still mounts its subtree, which on phone means a second location's data
 * fetching and a second copy of everything in the accessibility tree.
 */
export const TWO_PANE_BREAKPOINT = 768;
// The design runs the list at 300 on tablet and 350 on desktop: the column
// holds the same rows either way, and on a wide screen the extra 50 goes to the
// place names rather than to more empty gutter beside them.
const LIST_WIDTH_TABLET = 300;
const LIST_WIDTH_DESKTOP = 350;
const DESKTOP = 1100;

export type TwoPaneProps = {
  list: ReactNode;
  detail: ReactNode;
  /** Which single pane the phone layout shows. */
  show?: "list" | "detail";
  breakpoint?: number;
  /**
   * Measured width. Defaults to the window — injectable so a pane nested inside
   * another split can size off its container instead of the viewport, and so
   * both shapes are testable without resizing jsdom.
   */
  width?: number;
  listWidth?: number;
};

export function TwoPane({
  list,
  detail,
  show = "list",
  breakpoint = TWO_PANE_BREAKPOINT,
  width,
  listWidth,
}: TwoPaneProps) {
  const window = useWindowDimensions();
  const available = width ?? window.width;
  const paneWidth =
    listWidth ?? (available >= DESKTOP ? LIST_WIDTH_DESKTOP : LIST_WIDTH_TABLET);

  if (available < breakpoint) {
    return (
      <View testID={`twopane-${show}`} style={{ flex: 1 }}>
        {show === "detail" ? detail : list}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View
        testID="twopane-list"
        className="border-r-line bg-surface"
        style={{
          width: paneWidth,
          flexGrow: 0,
          flexShrink: 0,
          borderRightWidth: 1,
        }}
      >
        {list}
      </View>
      {/* minWidth 0 so a long place name in the detail pane wraps instead of
          pushing the list off the screen — flex children default to
          min-width:auto, which refuses to shrink below their content. */}
      <View testID="twopane-detail" style={{ flex: 1, minWidth: 0 }}>
        {detail}
      </View>
    </View>
  );
}
