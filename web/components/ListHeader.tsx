import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

/**
 * The masthead of the locations list: wordmark, one line of status, one line of key.
 *
 * THE WORDMARK IS THE ONLY BRANDING IN THE APP. There is no logo, no icon in a
 * bar, no colour that means "byge" — just the name set in the display face. It
 * belongs here because this is the app's root screen and the only place a
 * person arrives at cold. The verdict screen deliberately does not repeat it:
 * that screen's job is to answer a question, and a wordmark above the answer is
 * the app talking about itself instead.
 *
 * THE KEY IS ONE LINE, ALWAYS VISIBLE. "FILLED = RAINING NOW · OUTLINE = ON THE
 * WAY · HATCHED = NOT OBSERVED" is the whole legend a scanner needs, and it is
 * set in mono at the smallest size in the app so it reads as an annotation on
 * the list rather than as content in it. The expandable `PrecipitationLegend`
 * below the list is the *long* form — the mm/h ramp, what each shape means in a
 * sentence — and a collapsed disclosure was never a substitute for this line.
 * Someone who has to open something to learn what the shapes mean is someone
 * who never learns what the shapes mean.
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
};

export function ListHeader({ count, ageMin, offline, compact = false }: ListHeaderProps) {
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

      <Text
        testID="list-key"
        className="text-ink3 font-mono"
        style={{
          fontSize: compact ? 8.5 : 9,
          marginTop: compact ? 7 : 8,
          letterSpacing: 0.45,
          lineHeight: (compact ? 8.5 : 9) * 1.6,
        }}
      >
        {t("list.key")}
      </Text>
    </View>
  );
}
