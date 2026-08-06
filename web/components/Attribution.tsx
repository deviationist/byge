import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { ExternalLink } from "./ExternalLink";

/**
 * "Data from MET Norway · NLOD 2.0 / CC BY 4.0".
 *
 * A licence condition, not a decoration — MET's terms require identification and
 * CC BY 4.0 requires the licence itself be reachable. So the names are real
 * links, not text that merely mentions them.
 *
 * THE LEGAL SENTENCE IS NOT NAVIGATION. An early comp hung About *and*
 * Settings inside this line, which put a theme switcher behind a 9.5 px legal
 * footnote. That is still refused: nothing is ever added between "Data from"
 * and the licence names.
 *
 * `onAbout` is the design's own resolution, and it is a different thing — a
 * SEPARATE line beneath the obligation, with its own tap target, exactly as the
 * final specimen draws it. About is a genuinely low-frequency destination, and
 * this screen is the root, so there is no nav bar to hang it off; a bar
 * containing nothing but one ghost button was furniture around an empty slot.
 */

// The links go through ExternalLink, which is an <a> on web and a Linking
// .openURL on native. Before that split they were a Text cast to accept href —
// a react-native-web affordance, so on iOS and Android they would have rendered
// as underlined text that does nothing. A licence obligation cannot be a link
// that only looks like one.

const MET = "https://www.met.no/";
const NLOD = "https://data.norge.no/nlod/en/2.0";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

export type AttributionProps = {
  /** Renders the About line beneath the licence text. Omitted on screens that already have a route to it. */
  onAbout?: () => void;
};

export function Attribution({ onAbout }: AttributionProps = {}) {
  const { t } = useTranslation();
  const base = {
    fontSize: 9.5,
    lineHeight: 15,
  } as const;
  const link = { ...base, textDecorationLine: "underline" as const };

  return (
    <View
      className="border-t-line"
      style={{
        borderTopWidth: 1,
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      <Text className="text-ink3" style={base}>
        {t("attribution.dataFrom")}{" "}
        <ExternalLink href={MET} className="text-ink3" style={link}>
          {t("attribution.met")}
        </ExternalLink>{" "}
        ·{" "}
        <ExternalLink href={NLOD} className="text-ink3" style={link}>
          {t("attribution.nlod")}
        </ExternalLink>{" "}
        /{" "}
        <ExternalLink href={CC_BY} className="text-ink3" style={link}>
          {t("attribution.ccBy")}
        </ExternalLink>
      </Text>

      {onAbout ? (
        <Pressable
          testID="about-link"
          accessibilityRole="button"
          accessibilityLabel={t("nav.aboutByge")}
          onPress={onAbout}
          // Its own row and its own target. The licence text above stays a
          // sentence you read; this is a thing you press.
          style={({ pressed }) => ({
            marginTop: 6,
            paddingVertical: 6,
            alignSelf: "flex-start",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text className="text-ink3" style={{ ...base, textDecorationLine: "underline" }}>
            {t("nav.aboutByge")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
