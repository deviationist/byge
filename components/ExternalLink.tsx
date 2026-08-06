import type { ComponentType } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";

/**
 * A link out of the app — web half.
 *
 * react-native-web renders `Text` with an `href` as a real anchor, which is
 * what legal attribution needs: openable in a new tab, copyable, reachable by
 * keyboard, and announced as a link. A Pressable that calls `open()` is none of
 * those things.
 *
 * `target`/`rel` go through `hrefAttrs`, not as bare props — react-native-web
 * drops unknown props on `Text`, so passing them directly silently produced
 * anchors with no target at all.
 */
export type ExternalLinkProps = TextProps & {
  href: string;
  style?: TextStyle;
};

type AnchorProps = TextProps & {
  href?: string;
  hrefAttrs?: { target?: string; rel?: string; download?: string };
};

const Anchor = Text as unknown as ComponentType<AnchorProps>;

export function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  return (
    <Anchor
      {...rest}
      accessibilityRole="link"
      href={href}
      hrefAttrs={{ target: "_blank", rel: "noreferrer" }}
    >
      {children}
    </Anchor>
  );
}
