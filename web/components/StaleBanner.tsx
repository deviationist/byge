import { Text, View } from "react-native";

/**
 * Offline, with a cached verdict still on screen.
 *
 * This is NOT the error state, and the difference is the whole reason both
 * components exist:
 *
 *   StaleBanner  we are offline; the answer below is real, just older than we
 *                would like, and it will refresh by itself
 *   ErrorState   we are online, the request failed, and we have nothing
 *
 * Dressing a failed request as staleness tells someone a cached verdict is
 * being kept current when nothing is keeping it current. An error must never
 * be presented as age.
 *
 * Age here is degradation, not expiry. byge indexes by *valid time*, so a
 * 20-minute-old analysis still answers "is it raining now" from its T+20
 * frame — which is why this is a banner over a live verdict rather than a
 * blocking state that hides it.
 */
export type StaleBannerProps = {
  /** Age of the analysis on screen, in minutes. */
  ageMin: number;
};

export function StaleBanner({ ageMin }: StaleBannerProps) {
  // Never "0 min ago". The banner exists to say the answer is old, and a zero
  // reads as fresh — it would contradict the sentence it sits inside.
  const age = Math.max(1, Math.round(ageMin));

  return (
    <View
      role="status"
      className="bg-sunk border-line"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      {/* The glyph is decoration; the word "offline" in the sentence carries
          the state. Nothing here is signalled by colour alone. */}
      <Text className="text-ink3" style={{ fontSize: 13, lineHeight: 20 }}>
        ⌁
      </Text>
      <Text className="text-ink2" style={{ flex: 1, fontSize: 12.5, lineHeight: 20 }}>
        Showing the verdict from {age} min ago — you are offline. It will refresh the moment you
        are back.
      </Text>
    </View>
  );
}
