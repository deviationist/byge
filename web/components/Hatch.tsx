/**
 * The "not observed" fill — web half. Renders nothing, on purpose.
 *
 * On web the hatch is already painted by `backgroundImage: HATCH` on the
 * element itself, which is strictly the better implementation there: one CSS
 * declaration, no extra nodes, and a repeat that is exact at any size. React
 * Native has no `backgroundImage` property at all, so `Hatch.native.tsx` has to
 * compose the same pattern from rotated views — and this file is what lets the
 * callers say `<Hatch />` unconditionally without a Platform check at every
 * site.
 *
 * So: this is not a stub. It is the statement that web needs no extra element,
 * and it keeps the DOM identical to what it was before native was a target.
 */
export type HatchProps = {
  /**
   * Longest edge of the box being filled, px. Unused here; the native side
   * needs it to work out how many strokes cover the diagonal.
   */
  size?: number;
};

export function Hatch(_props: HatchProps) {
  return null;
}
