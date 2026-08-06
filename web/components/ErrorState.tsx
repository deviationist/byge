import { Text, View } from "react-native";
import { Button } from "./Button";

/**
 * The request failed while we were online, as distinct from being offline with
 * a cached answer.
 *
 * `StaleBanner` covers "we are offline, here is the verdict from 34 min ago".
 * This covers "we are online, MET did not answer, and we have nothing". They
 * are different facts and get different words — the one thing this component
 * must never do is imply the answer on screen is merely old, or that a refresh
 * is happening on its own.
 *
 * Two forms:
 *
 *   full    nothing to show at all. Occupies the screen, offers a retry.
 *   inline  a refresh failed but the previous verdict is still valid and still
 *           on screen. A note, not a takeover — see ARCHITECTURE "Refresh".
 *
 * `inline` is what `RefreshControl` renders for its failed outcome.
 */
export type ErrorStateProps = {
  variant?: "full" | "inline";
  onRetry?: () => void;
  /** Technical detail, shown small. Never a substitute for the plain sentence. */
  detail?: string;
};

const FULL_TITLE = "Could not reach the radar";
const FULL_BODY =
  "You are online — the request to MET Norway failed. There is no saved answer for this place " +
  "yet, so byge has nothing to show. It will not guess.";
const INLINE_BODY = "Refresh failed — this is still the answer from before.";

export function ErrorState({ variant = "full", onRetry, detail }: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <View
        role="status"
        className="border-line2"
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          borderWidth: 1,
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <Text
          className="text-ink2"
          style={{ flex: 1, minWidth: 180, fontSize: 12.5, lineHeight: 20 }}
        >
          {INLINE_BODY}
        </Text>
        {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }

  return (
    <View
      role="alert"
      className="bg-surface border-line2"
      style={{
        gap: 14,
        borderWidth: 1,
        borderRadius: 16,
        padding: 22,
      }}
    >
      <Text
        accessibilityRole="header"
        className="text-ink"
        style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }}
      >
        {FULL_TITLE}
      </Text>
      <Text className="text-ink2" style={{ fontSize: 13.5, lineHeight: 22 }}>
        {FULL_BODY}
      </Text>
      {detail ? (
        <Text
          className="text-ink3 bg-sunk"
          style={{
            fontSize: 10.5,
            lineHeight: 18,
            borderRadius: 9,
            paddingVertical: 11,
            paddingHorizontal: 13,
          }}
        >
          {detail}
        </Text>
      ) : null}
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}
