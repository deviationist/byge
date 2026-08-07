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
 * IT DISTINGUISHES "ENDED" FROM "STILL ARRIVING", which sounds like a detail and
 * was a lie on screen. The field streams a frame at a time, so a fresh map has
 * one frame and a playhead already at the end of it — the control read that as
 * the end of the run and offered REPLAY, on a run that had not started. Nothing
 * in a frame count can tell those apart; only the loader knows, so it says.
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
  /**
   * How many frames the run will have once it is all in.
   *
   * Only differs from `count` while streaming. Absent means "the same", which
   * is the right default for a caller that has no stream to report on.
   */
  expected?: number;
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
  /**
   * More frames are still on the wire.
   *
   * The reason REPLAY cannot be inferred from `index >= count - 1` alone: while
   * a run is streaming, the last frame we have is not the last frame there is,
   * and the playhead sitting on it means "caught up", not "finished".
   */
  buffering?: boolean;
  /**
   * Step one frame. Negative is back.
   *
   * Separate from `onToggle` because it is a different verb: play is "run the
   * two hours", step is "show me that one". A transport with only play is
   * unusable for the thing people actually do on a radar map, which is inch
   * back and forth over the moment a band reaches them.
   */
  onStep?: (delta: number) => void;
};

export function PlaybackControl({
  playing,
  onToggle,
  index,
  count,
  expected,
  minutes,
  openEnded = false,
  buffering = false,
  onStep,
}: PlaybackControlProps) {
  const { t } = useTranslation();
  // Nothing to play yet — not paused, not ended, just not here.
  const empty = count === 0;
  const ended = !playing && !buffering && count > 0 && index >= count - 1;

  const canBack = !!onStep && !empty && index > 0;
  const canForward = !!onStep && !empty && index < count - 1;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
      {onStep ? (
        <StepButton
          testID="step-back"
          label={t("playback.stepBack")}
          disabled={!canBack}
          onPress={() => onStep(-1)}
          glyph="‹"
        />
      ) : null}

      <Pressable
        testID="playback"
        accessibilityRole="button"
        accessibilityLabel={
          empty
            ? t("playback.waiting")
            : playing
              ? t("radarMap.pause")
              : ended
                ? t("radarMap.replay")
                : t("radarMap.play")
        }
        // Disabled rather than hidden: the control keeps its place in the
        // layout, so the foot of the map does not reflow the moment data lands.
        disabled={empty}
        aria-disabled={empty}
        onPress={onToggle}
        className="bg-surface border-line2"
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          opacity: empty ? 0.45 : pressed ? 0.7 : 1,
        })}
      >
        {/* Drawn from views rather than glyphs: a font's ▶ sits off-centre in a
            circle and differs between platforms, and this is a 44 px target
            whose whole job is to be recognised instantly. */}
        {playing ? <PauseIcon /> : ended ? <ReplayIcon /> : <PlayIcon />}
      </Pressable>

      {onStep ? (
        <StepButton
          testID="step-forward"
          label={t("playback.stepForward")}
          disabled={!canForward}
          onPress={() => onStep(1)}
          glyph="›"
        />
      ) : null}

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
          {empty
            ? t("playback.waiting")
            : ended
              ? t("playback.ended")
              : // While streaming, `count` is what we HAVE and `expected` is
                // what is coming. Showing "frame 3 of 3" on a 24-frame run
                // would be true and misleading in the same breath.
                buffering
                ? t("playback.buffering", { i: index + 1, total: expected ?? count })
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

/**
 * One frame back or forward.
 *
 * 36 px drawn inside a 44 px row, so the target meets the minimum without the
 * two of them crowding the play button they flank. The chevrons are the same
 * marks the design puts either side of the graph's playhead, so the two
 * controls read as the same instrument.
 */
function StepButton({
  testID,
  label,
  glyph,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      className="border-line2"
      style={({ pressed }) => ({
        width: 36,
        height: 44,
        borderRadius: 9,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Text aria-hidden className="text-ink font-mono" style={{ fontSize: 15, lineHeight: 18 }}>
        {glyph}
      </Text>
    </Pressable>
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
