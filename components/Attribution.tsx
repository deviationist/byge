import type { ComponentType } from "react";
import { Text, type TextProps, View } from "react-native";

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

// react-native-web renders a Text with `href` as a real <a>. RN core's types do
// not declare it, and the cast is preferred over an onPress handler because a
// legal attribution has to behave like a link — openable in a new tab,
// copyable, reachable by keyboard — not like a button that needs a mouse.
//
// `target`/`rel` go through `hrefAttrs`, not as bare props: react-native-web
// drops unknown props on Text, so passing them directly silently produced
// anchors with no target at all.
type LinkProps = TextProps & {
  href?: string;
  hrefAttrs?: { target?: string; rel?: string; download?: string };
};
const Link = Text as unknown as ComponentType<LinkProps>;

const OPEN_AWAY = { target: "_blank", rel: "noreferrer" };

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
        <Link href={MET} hrefAttrs={OPEN_AWAY} accessibilityRole="link" className="text-ink3" style={link}>
          MET Norway
        </Link>{" "}
        ·{" "}
        <Link href={NLOD} hrefAttrs={OPEN_AWAY} accessibilityRole="link" className="text-ink3" style={link}>
          NLOD 2.0
        </Link>{" "}
        /{" "}
        <Link href={CC_BY} hrefAttrs={OPEN_AWAY} accessibilityRole="link" className="text-ink3" style={link}>
          CC BY 4.0
        </Link>
      </Text>
    </View>
  );
}
