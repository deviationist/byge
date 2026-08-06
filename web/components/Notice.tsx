import { Text, View } from "react-native";

/**
 * The line above the list that confirms a mutation.
 *
 * Two rules, both from the design and both easy to get wrong:
 *
 * THE CONFIRMATION LIVES WHERE THE CHANGE IS VISIBLE. A removal is confirmed
 * above the list that is now shorter — not on the screen you were on when you
 * asked for it. That is why this belongs to the list rather than to the verdict
 * you deleted from.
 *
 * IT NEVER OFFERS UNDO. There is none: the confirmation happened before the
 * deletion, and `ConfirmSheet` said in as many words that nothing is holding a
 * copy. A dead "Undo" is worse than no undo, because it implies a way back that
 * does not exist.
 *
 * One slot for every mutation — "Removed Cabin.", "Saved Cabin.", "Cabin now
 * covers 15 km." — so the pattern is learnable rather than per-action.
 */
export type NoticeProps = {
  /** Absent or empty renders nothing at all, not an empty row. */
  text?: string;
};

export function Notice({ text }: NoticeProps) {
  if (!text) return null;
  return (
    <View
      testID="notice"
      className="bg-sunk border-line"
      style={{ borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 }}
    >
      {/*
        `status` rather than `alert`: this reports something that already
        happened successfully. `alert` would interrupt a screen reader
        mid-sentence to announce a routine confirmation.
      */}
      <Text
        role="status"
        aria-live="polite"
        className="text-ink2 font-mono"
        style={{ fontSize: 11, lineHeight: 17 }}
      >
        {text}
      </Text>
    </View>
  );
}
