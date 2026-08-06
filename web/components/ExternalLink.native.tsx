import { Linking, Text, type TextProps, type TextStyle } from "react-native";

/**
 * A link out of the app — iOS/Android half.
 *
 * There is no anchor on native: `href` on a `Text` is a react-native-web
 * affordance and does nothing here, so without this the MET Norway, NLOD and
 * CC BY links would render as ordinary underlined text and simply not open.
 * Attribution is a licence obligation, which makes "looks like a link, isn't
 * one" the one failure mode not available to us.
 *
 * Stays a `Text` rather than becoming a `Pressable` so it can still sit inline
 * inside a sentence — the attribution reads "Data from MET Norway · NLOD 2.0 /
 * CC BY 4.0", and a Pressable would break the line into blocks. `Text` takes
 * `onPress` on native and keeps the link role for assistive tech.
 */
export type ExternalLinkProps = TextProps & {
  href: string;
  style?: TextStyle;
};

export function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  return (
    <Text
      {...rest}
      accessibilityRole="link"
      onPress={() => {
        // Fire-and-forget: a refusal (no handler for the scheme, or the user
        // dismissing the sheet) is not worth an error state over a colophon.
        void Linking.openURL(href).catch(() => {});
      }}
    >
      {children}
    </Text>
  );
}
