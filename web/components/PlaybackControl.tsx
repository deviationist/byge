import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { MONO } from "../theme/tokens";

/**
 * One transport and a clock, per Design's ruling on the map brief.
 *
 * IT STOPS AT THE HORIZON — confirmed rather than merely kept. Looping is the
 * convention and the convention is wrong here: it turns a two-hour forecast into
 * wallpaper and erases the single most important moment on the screen, the frame
 * where the data runs out. Stopping leaves the reader exactly there, which is
 * the same edge the verdict means by "no end in sight". The button then reads
 * REPLAY, so the stop is a state rather than a failure.
 *
 * IT NEVER AUTOPLAYS. Arriving into motion means the first frame a reader sees
 * is not the present, and the present is the one frame the verdict is about.
 *
 * REDUCED MOTION SLOWS IT rather than removing it — 380 ms normally, 900 ms when
 * the OS asks for less. Stepping through frames is how this screen is read, so
 * removing the control would take away the point instead of the motion.
 *
 * The clock is RELATIVE first and wall time second, which is the convention the
 * verdict sentence already uses. One app, one way of saying when.
 */
export type PlaybackControlProps = {
  playing: boolean;
  onToggle: () => void;
  /** Zero-based frame on screen, and how many there are. */
  index: number;
  count: number;
  /** Minutes from the analysis for that frame. */
  minutes: number;
  /**
   * The spell under the reader is still going at the last frame.
   *
   * Only then does the horizon line appear — it says the run has ended, not the
   * weather, and saying that when the field is clear would invent an open end
   * nobody claimed.
   */
  openEnded?: boolean;
};

export function PlaybackControl({
  playing,
  onToggle,
  index,
  count,
  minutes,
  openEnded = false,
}: PlaybackControlProps) {
  const { t } = useTranslation();
  const ended = !playing && count > 0 && index >= count - 1;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
      <Pressable
        testID="playback"
        accessibilityRole="button"
        accessibilityLabel={
          playing ? t("radarMap.pause") : ended ? t("radarMap.replay") : t("radarMap.play")
        }
        onPress={onToggle}
        className="bg-surface border-line2"
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {/* Drawn from views rather than glyphs: a font's ▶ sits off-centre in a
            circle and differs between platforms, and this is a 44 px target
            whose whole job is to be recognised instantly. */}
        {playing ? <PauseIcon /> : ended ? <ReplayIcon /> : <PlayIcon />}
      </Pressable>

      <View style={{ gap: 3, minWidth: 0 }}>
        <Text
          testID="playback-time"
          className="text-ink"
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            letterSpacing: 0.25,
            fontVariant: ["tabular-nums"],
          }}
        >
          {t("playback.clock", {
            when: minutes === 0 ? t("graph.now") : t("graph.ahead", { min: minutes }),
            time: clockAt(minutes),
          })}
        </Text>
        <Text
          className="text-ink3"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.4 }}
        >
          {ended
            ? t("playback.ended")
            : playing
              ? t("playback.playing", { i: index + 1, n: count })
              : t("playback.frame", { i: index + 1, n: count })}
        </Text>
      </View>

      {ended && openEnded ? (
        <Text
          testID="playback-horizon"
          className="text-ink3"
          style={{
            marginLeft: "auto",
            maxWidth: 260,
            fontFamily: MONO,
            fontSize: 9.5,
            lineHeight: 15,
            textAlign: "right",
          }}
        >
          {t("playback.horizon")}
        </Text>
      ) : null}
    </View>
  );
}

/** Wall time of a frame, h23 — "around 24:05" is not a time anyone recognises. */
function clockAt(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <View
      aria-hidden
      className="border-l-ink"
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: 12,
        borderTopWidth: 7.5,
        borderBottomWidth: 7.5,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        marginLeft: 3,
      }}
    />
  );
}

function PauseIcon() {
  return (
    <View aria-hidden style={{ flexDirection: "row", gap: 3.5 }}>
      <View className="bg-ink" style={{ width: 3.5, height: 14, borderRadius: 1 }} />
      <View className="bg-ink" style={{ width: 3.5, height: 14, borderRadius: 1 }} />
    </View>
  );
}

/** An open circle with a head — a loop that stops, which is what replay means. */
function ReplayIcon() {
  return (
    <View
      aria-hidden
      className="border-ink"
      style={{
        width: 13,
        height: 13,
        borderWidth: 1.5,
        borderRadius: 7,
        borderRightColor: "transparent",
      }}
    >
      <View
        className="border-t-ink"
        style={{
          position: "absolute",
          top: -2.5,
          right: -1,
          width: 0,
          height: 0,
          borderTopWidth: 4,
          borderLeftWidth: 4,
          borderLeftColor: "transparent",
        }}
      />
    </View>
  );
}
