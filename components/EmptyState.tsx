import { Text, View } from "react-native";
import { Button } from "./Button";

/**
 * No saved places — for two quite different reasons.
 *
 *   first-run     the actual first impression of the app. Nobody has been told
 *                 what byge does yet, so this one explains and invites.
 *   removed-last  the list is empty because the reader just emptied it. They
 *                 know what byge does; they did it on purpose thirty seconds
 *                 ago. Pitching the product back at them reads as if the
 *                 deletion did not register, so this form confirms the action,
 *                 names the place, and stops.
 *
 * Same emptiness, opposite tone. One shared "add your first place" screen would
 * be wrong half the time.
 */
export type EmptyReason = "first-run" | "removed-last";

export type EmptyStateProps = {
  reason: EmptyReason;
  /** The place just deleted. Used by `removed-last` so the confirmation is specific. */
  removedName?: string;
  onAdd?: () => void;
};

export function EmptyState({ reason, removedName, onAdd }: EmptyStateProps) {
  const removed = reason === "removed-last";

  // A nameless removal still gets the removal *tone* — falling back to the
  // first-run pitch because a prop is missing would be the wrong copy for the
  // wrong reason.
  const title = removed
    ? removedName
      ? `${removedName} removed.`
      : "Removed."
    : "Nowhere saved yet";

  const body = removed
    ? "That was your last saved place, so there is nothing left to check. It is gone from this " +
      "device — there is no account and no sync, so nothing else is holding a copy."
    : "Add a place — home, the cabin, a trailhead — and byge will tell you whether it is raining " +
      "there and for how long, straight from MET Norway's radar. Everything stays on this device.";

  return (
    <View
      style={{
        gap: 14,
        alignItems: "flex-start",
        paddingVertical: 28,
        paddingHorizontal: 4,
      }}
    >
      <Text
        accessibilityRole="header"
        className="text-ink"
        style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
      <Text className="text-ink2" style={{ fontSize: 13.5, lineHeight: 22 }}>
        {body}
      </Text>
      {onAdd ? (
        <Button
          label="Add a place"
          onPress={onAdd}
          variant={removed ? "secondary" : "primary"}
        />
      ) : null}
    </View>
  );
}
