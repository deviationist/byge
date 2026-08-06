import type { ReactNode } from "react";
import { useId } from "react";
import type { TextStyle } from "react-native";
import { Text, View } from "react-native";

/**
 * A titled group with consistent spacing.
 *
 * The title is a real heading wired to the group with `aria-labelledby`, so the
 * add-a-place form reads as "Coordinates, group" rather than as a flat run of
 * inputs — which is the difference between navigating it by section and tabbing
 * through the whole thing.
 */
export type SectionProps = {
  title: string;
  children?: ReactNode;
  /** Standing explanation for the whole group. */
  hint?: string;
  gap?: number;
};

const TITLE = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 9.5,
  letterSpacing: 0.5,
  // Uppercased in CSS rather than in the string, so the accessible name stays
  // the prop's own casing — screen readers spell out shouted words.
  textTransform: "uppercase",
} satisfies TextStyle;

export function Section({ title, children, hint, gap = 9 }: SectionProps) {
  const id = useId();
  return (
    <View role="group" aria-labelledby={id} style={{ gap }}>
      <Text nativeID={id} role="heading" className="text-ink3" style={TITLE}>
        {title}
      </Text>
      {hint ? (
        <Text
          className="text-ink3"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            lineHeight: 16,
          }}
        >
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
