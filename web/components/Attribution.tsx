import { Text, View } from "react-native";
import { ExternalLink } from "./ExternalLink";

/**
 * "Data from MET Norway · NLOD 2.0 / CC BY 4.0".
 *
 * A licence condition, not a decoration — MET's terms require identification and
 * CC BY 4.0 requires the licence itself be reachable. So the names are real
 * links, not text that merely mentions them.
 *
 * IT IS NOT NAVIGATION. The design comp hung About and Settings off this line,
 * which put the theme switcher behind a 9.5px legal footnote. Deliberately
 * there is no `onAbout` prop and no chevron: an obligation with an
 * obligation-sized affordance should not also be the route to a functional
 * screen. About gets its own entry point on the Locations nav bar.
 */

// The links go through ExternalLink, which is an <a> on web and a Linking
// .openURL on native. Before that split they were a Text cast to accept href —
// a react-native-web affordance, so on iOS and Android they would have rendered
// as underlined text that does nothing. A licence obligation cannot be a link
// that only looks like one.

const MET = "https://www.met.no/";
const NLOD = "https://data.norge.no/nlod/en/2.0";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

export function Attribution() {
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
        Data from{" "}
        <ExternalLink href={MET} className="text-ink3" style={link}>
          MET Norway
        </ExternalLink>{" "}
        ·{" "}
        <ExternalLink href={NLOD} className="text-ink3" style={link}>
          NLOD 2.0
        </ExternalLink>{" "}
        /{" "}
        <ExternalLink href={CC_BY} className="text-ink3" style={link}>
          CC BY 4.0
        </ExternalLink>
      </Text>
    </View>
  );
}
