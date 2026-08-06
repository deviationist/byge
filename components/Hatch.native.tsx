import { View } from "react-native";
import { HATCH_PATTERN } from "../theme/tokens";

/**
 * The "not observed" fill — iOS/Android half.
 *
 * React Native has no `backgroundImage`, so the CSS gradient the web uses
 * cannot cross over. Without this, a blind swatch and an unobserved bar would
 * render as a flat pale square on native — and a flat pale square reads as a
 * band, or as dry. Those are the two things "we cannot see here" must never be
 * mistaken for, which is the whole reason the mark exists.
 *
 * Composed from rotated views rather than an SVG pattern, to avoid pulling in
 * react-native-svg for what is at most a few dozen strokes on a 13px swatch or
 * a 46px bar. Every number comes from HATCH_PATTERN, the same source the CSS
 * string is built from, so the two renderings cannot drift apart.
 *
 * The parent is expected to clip (`overflow: hidden`) — strokes are drawn long
 * enough to cross the box at 45° and are allowed to overhang.
 */
export type HatchProps = {
  /** Longest edge of the box being filled, px. Decides how many strokes. */
  size?: number;
};

const { angleDeg, lineWidth, period, color } = HATCH_PATTERN;

export function Hatch({ size = 64 }: HatchProps) {
  // A 45° stroke crosses a square of side `size` over a span of size·√2, and
  // the strokes are drawn from the centre outwards, so cover half in each
  // direction plus one to be sure the corners fill.
  const span = size * Math.SQRT2;
  const count = Math.ceil(span / period) + 1;
  const length = span;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" }}
    >
      {Array.from({ length: count }, (_, i) => {
        // Offset from the centre of the box, so the pattern stays put as the
        // box grows rather than crawling out from one corner.
        const offset = (i - (count - 1) / 2) * period;
        return (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static geometry
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: length,
              height: lineWidth,
              backgroundColor: color,
              transform: [
                { translateX: -length / 2 },
                { translateY: offset },
                { rotate: `${angleDeg}deg` },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
