import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { MONO } from "../theme/tokens";

/**
 * Play the two hours through.
 *
 * NOT IN THE DESIGN, and added knowingly. `RadarMap.dc.html` wires exactly one
 * time control — the graph, as a scrubber — and the file is emphatic that this
 * screen is a confirmation layer rather than a weather map you watch. So this
 * is the smallest thing that adds playback without changing what the screen is:
 * one button, driving the frame the graph already selects. It does not become a
 * second timeline, and the graph stays both the display and the scrubber.
 * Whether a separate slider belongs here is a question for Design, not one to
 * answer by building it.
 *
 * IT NEVER AUTOPLAYS. A map that starts moving on arrival is the thing byge
 * defines itself against, and it takes the choice away from anyone who finds
 * motion unpleasant. `prefers-reduced-motion` is honoured for the same reason,
 * one level further: the control stays, because stepping through frames is how
 * you read this screen, but it advances slowly enough to follow rather than
 * animating.
 */
export type PlaybackControlProps = {
  playing: boolean;
  onToggle: () => void;
  /** Minutes from the analysis for the frame on screen. */
  minutes: number;
  /**
   * Sitting on the last frame.
   *
   * Playback stops at the horizon rather than looping — that is deliberate, the
   * end of the data is where byge starts saying "no end in sight" and the
   * reader should be left there. But stopping left the control saying "play"
   * while pressing it did nothing at all, because there was nowhere further to
   * go. It says REPLAY instead, and starts again from now.
   */
  atEnd?: boolean;
};

export function PlaybackControl({
  playing,
  onToggle,
  minutes,
  atEnd = false,
}: PlaybackControlProps) {
  const { t } = useTranslation();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable
        testID="playback"
        accessibilityRole="button"
        // Names the ACTION and the state, because the glyph alone is a shape.
        accessibilityLabel={
          playing ? t("radarMap.pause") : atEnd ? t("radarMap.replay") : t("radarMap.play")
        }
        onPress={onToggle}
        className="bg-surface border-line2"
        style={({ pressed }) => ({
          minWidth: 44,
          minHeight: 32,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {/*
          Decorative — the accessible name above carries it. A screen reader
          announcing "black right-pointing triangle" is noise.
        */}
        <Text aria-hidden className="text-ink" style={{ fontSize: 12 }}>
          {playing ? "❚❚" : atEnd ? "↻" : "▶"}
        </Text>
      </Pressable>

      {/*
        `tabular-nums` so the row does not jitter as the number changes width
        while playing — the one place in the app where a label updates five
        times a second.
      */}
      <Text
        testID="playback-time"
        className="text-ink2"
        style={{ fontFamily: MONO, fontSize: 10, fontVariant: ["tabular-nums"] }}
      >
        {minutes === 0 ? t("graph.now") : t("graph.ahead", { min: minutes })}
      </Text>
    </View>
  );
}
