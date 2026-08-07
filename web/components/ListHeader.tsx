import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { MONO } from "../theme/tokens";

/**
 * The masthead of the locations list: wordmark, one line of status.
 *
 * THE WORDMARK IS THE ONLY BRANDING IN THE APP. There is no logo, no icon in a
 * bar, no colour that means "byge" — just the name set in the display face. It
 * belongs here because this is the app's root screen and the only place a
 * person arrives at cold. The verdict screen deliberately does not repeat it:
 * that screen's job is to answer a question, and a wordmark above the answer is
 * the app talking about itself instead.
 *
 * NO KEY LINE HERE, and that is a deliberate step away from the specimen, which
 * sets "FILLED = RAINING NOW · OUTLINE = ON THE WAY · HATCHED = NOT OBSERVED"
 * under the caption. The specimen has no expandable legend at all; we do, and
 * running both meant explaining the same three shapes twice on one screen — once
 * in shouty mono a reader must decode, once in sentences beside the actual
 * swatches. The card wins that comparison. What made the card viable is that it
 * shows the three shapes in its collapsed header: the objection to a disclosure
 * was that nobody finds it, and a card displaying the very symbols it explains
 * is found.
 *
 * The caption is deliberately about the DATA, not the app: how many places and
 * how fresh the answer is. It is the only place on the list screen that admits
 * the verdicts have an age at all.
 */
export type ListHeaderProps = {
  count: number;
  /** Age of the analysis behind the verdicts, in minutes. Undefined while checking. */
  ageMin?: number;
  /** Showing a cached answer because the network is gone. */
  offline?: boolean;
  /**
   * The two-pane list pane is a 350 px column, so everything steps down. Not a
   * separate component: one masthead worded one way, set at two sizes.
   */
  compact?: boolean;
  /**
   * Opens the radar map. Omitted where there is nowhere to go — the two-pane
   * list pane passes it, the phone list passes it, a static render does not.
   */
  onRadar?: () => void;
};

export function ListHeader({
  count,
  ageMin,
  offline,
  compact = false,
  onRadar,
}: ListHeaderProps) {
  const { t } = useTranslation();

  const places = t("list.places", { count });
  const freshness =
    ageMin === undefined
      ? t("list.checking")
      : offline
        ? t("list.offlineAge", { age: Math.max(1, Math.round(ageMin)) })
        : ageMin < 1
          ? t("list.justNow")
          : t("list.updatedAge", { age: Math.round(ageMin) });

  return (
    <View testID="list-header">
      {/*
        THE MASTHEAD IS NOW A JUNCTION, not just a name.
        
        The radar was reachable only from a quiet text line under the legend —
        Design's placement, and their reasoning was sound: the risk was never
        that the map exists, it was that the map becomes the front door. But
        quiet turned out to be invisible; the person who built this app could
        not find it. So the map is promoted to a PEER of the places rather than
        to the landing view: the launcher still opens this list, byge still
        answers with a sentence before it offers a picture, and the map is one
        tap from the top of the screen instead of the bottom.
      */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        <Text
          testID="wordmark"
        // A heading in the accessibility tree, so a screen reader user gets the
        // same "you are in byge, this is the list" that a sighted user gets from
        // the display face.
        accessibilityRole="header"
        className="text-ink font-display"
        style={{ fontSize: compact ? 22 : 30, letterSpacing: 0.01 * (compact ? 22 : 30) }}
      >
          byge
        </Text>

        {onRadar ? (
          <Pressable
            testID="radar-link"
            accessibilityRole="link"
            accessibilityLabel={t("list.radarEntry")}
            onPress={onRadar}
            // Pushed to the far edge, so it reads as a destination rather than
            // as a subtitle of the wordmark.
            style={({ pressed }) => ({
              marginLeft: "auto",
              minHeight: 44,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text className="text-ink2 border-b-line2" style={{ fontSize: 13, paddingBottom: 2 }}>
              {t("list.radarShort")} <Text style={{ fontFamily: MONO }}>→</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text
        testID="list-caption"
        className="text-ink3 font-mono"
        style={{
          fontSize: compact ? 10 : 10.5,
          marginTop: compact ? 3 : 4,
          letterSpacing: 0.4,
        }}
      >
        {t("list.caption", { places, freshness })}
      </Text>
    </View>
  );
}
