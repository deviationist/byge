import { useId, useState } from "react";
import type { LayoutChangeEvent, TextStyle } from "react-native";
import i18next from "i18next";
import { MONO } from "../theme/tokens";
import { Pressable, Text, View } from "react-native";

/**
 * The per-location watch radius, in km. Feeds the circle in `MapField`.
 *
 * The rule behind it: **any rain touching the circle counts as rain there.**
 * That makes the control monotonic — widening only ever adds, and can never
 * turn a wet answer dry. The earlier "≥25 % of the disc is wet" gate did the
 * opposite: at one real coordinate, rain falling on the user read as *dry* at
 * 15 km simply because the same patch was diluted by a bigger disc. A control
 * that inverts its own meaning is worse than no control.
 *
 * So the widget is a *watch area* that grows, not a precision dial. Two things
 * follow, and both are in the copy rather than in a restriction:
 *
 *  - The floor is 2 km because the grid is 1 km. Below that there is nothing
 *    finer to see, so the extra travel would be theatre.
 *  - Past ~10 km the answer saturates: "some rain somewhere within 15 km in the
 *    next two hours" is very nearly always true in Norway, so the verdict stops
 *    being about the user's doorstep. That is a real trade, not a mistake, so
 *    the wide end gets a quiet word and stays reachable.
 */
export const RADIUS_MIN = 2;
export const RADIUS_MAX = 25;
export const RADIUS_DEFAULT = 3;

/** Where "any touch counts" starts answering yes almost regardless of weather. */
export const RADIUS_SATURATES = 10;
/** Where the subset payload is worth mentioning on a phone plan. */
export const RADIUS_COSTLY = 20;

const STEP = 1;
/** PageUp/PageDown — 2 to 25 in single steps is 23 presses. */
export const BIG_STEP = 5;

type WebProps = { onKeyDown?: (e: { key: string; preventDefault: () => void }) => void };
const web = (p: WebProps) => p as object;

const MIN_TARGET = 44;

export const clampRadius = (km: number, min = RADIUS_MIN, max = RADIUS_MAX) =>
  Math.min(max, Math.max(min, Math.round(km)));

/**
 * The standing explanation. Load-bearing: without it, someone who widens the
 * radius and watches the verdict flip to "raining" will assume the widening
 * *caused* rain rather than widening what counts.
 */
export const radiusHint = () => i18next.t("radius.hint");

/**
 * The quiet word at the wide end. Not a blocker: 25 km is a legitimate "watch
 * the whole valley" choice, it just stops being an answer about *you*.
 */
export function radiusNote(km: number): string | null {
  if (km < RADIUS_SATURATES) return null;
  const wide = i18next.t("radius.wide", { km });
  if (km < RADIUS_COSTLY) return wide;
  return `${wide} ${i18next.t("radius.costly")}`;
}

/**
 * What a screen reader hears instead of a bare number. The default and the
 * floor both mean something, and a number alone does not carry either.
 */
export function radiusValueText(km: number): string {
  if (km === RADIUS_DEFAULT) return i18next.t("radius.valueDefault", { km });
  if (km <= RADIUS_MIN) return i18next.t("radius.valueMin", { km });
  if (km >= RADIUS_SATURATES) return i18next.t("radius.valueWide", { km });
  return i18next.t("radius.value", { km });
}

/** Where a key press should land, or `null` for keys that are not ours. */
export function radiusFromKey(
  key: string,
  km: number,
  min = RADIUS_MIN,
  max = RADIUS_MAX,
): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampRadius(km + STEP, min, max);
    case "ArrowLeft":
    case "ArrowDown":
      return clampRadius(km - STEP, min, max);
    case "PageUp":
      return clampRadius(km + BIG_STEP, min, max);
    case "PageDown":
      return clampRadius(km - BIG_STEP, min, max);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

export type RadiusFieldProps = {
  value: number;
  onChange: (km: number) => void;
  label?: string;
  min?: number;
  max?: number;
  testID?: string;
};

const LABEL: TextStyle = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const NOTE: TextStyle = {
  fontFamily: MONO,
  fontSize: 10,
  lineHeight: 16,
};

const TRACK_H = 6;

function Step({
  label,
  glyph,
  onPress,
  disabled,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="border-line2"
      style={({ pressed }) => ({
        width: MIN_TARGET,
        height: MIN_TARGET,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        borderWidth: 1,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Text className="text-ink2" style={{ fontSize: 17, lineHeight: 20 }}>
        {glyph}
      </Text>
    </Pressable>
  );
}

export function RadiusField({
  value,
  onChange,
  label = "Radius",
  min = RADIUS_MIN,
  max = RADIUS_MAX,
  testID,
}: RadiusFieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const [trackWidth, setTrackWidth] = useState(0);

  const km = clampRadius(value, min, max);
  const note = radiusNote(km);
  const fraction = max === min ? 0 : (km - min) / (max - min);
  // The default's position on the track, drawn as a tick. It is the anchor the
  // copy keeps referring to, so it should be visible rather than only spoken.
  const defaultAt =
    RADIUS_DEFAULT >= min && RADIUS_DEFAULT <= max && max !== min
      ? (RADIUS_DEFAULT - min) / (max - min)
      : null;

  const set = (next: number) => {
    if (next !== km) onChange(next);
  };

  function onLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={{ gap: 9 }} testID={testID}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Text nativeID={labelId} className="text-ink3" style={LABEL}>
          {label}
        </Text>
        <Text className="text-ink" style={{ fontFamily: MONO, fontSize: 14 }}>
          {km} km
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Step
          label={i18next.t("radius.narrower")}
          glyph="−"
          disabled={km <= min}
          onPress={() => set(clampRadius(km - STEP, min, max))}
        />

        <Pressable
          role="slider"
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={km}
          aria-valuetext={radiusValueText(km)}
          tabIndex={0}
          onLayout={onLayout}
          onPress={(e) => {
            // Tap-to-set. Without it, 2 → 25 is 23 taps on the + button.
            if (trackWidth <= 0) return;
            const t = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackWidth));
            set(clampRadius(min + t * (max - min), min, max));
          }}
          {...web({
            onKeyDown: (e) => {
              const next = radiusFromKey(e.key, km, min, max);
              if (next === null) return;
              e.preventDefault();
              set(next);
            },
          })}
          style={{ flex: 1, height: MIN_TARGET, justifyContent: "center" }}
        >
          <View
            className="bg-sunk border-line"
            style={{
              height: TRACK_H,
              borderRadius: TRACK_H / 2,
              borderWidth: 1,
              justifyContent: "center",
            }}
          >
            {/* The fill grows with the radius, so "wider" reads as "more" —
                matching the rule that a wider circle can only add rain. */}
            <View
              className="bg-ink2"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${fraction * 100}%`,
                borderRadius: TRACK_H / 2,
              }}
            />
            {defaultAt === null ? null : (
              <View
                aria-hidden
                className="bg-line2"
                style={{
                  position: "absolute",
                  left: `${defaultAt * 100}%`,
                  width: 2,
                  top: -3,
                  bottom: -3,
                }}
              />
            )}
          </View>
        </Pressable>

        <Step
          label={i18next.t("radius.wider")}
          glyph="+"
          disabled={km >= max}
          onPress={() => set(clampRadius(km + STEP, min, max))}
        />
      </View>

      <Text className="text-ink3" style={NOTE}>
        {radiusHint()}
      </Text>

      {/* Polite, not assertive: the note appears while someone is dragging, and
          interrupting them mid-adjustment would be worse than arriving late. */}
      <View aria-live="polite">
        {note ? (
          <Text className="text-ink2" style={NOTE}>
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
