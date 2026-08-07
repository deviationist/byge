import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";

/**
 * A value on a range: track, fill, keyboard, tap-to-set.
 *
 * EXTRACTED RATHER THAN WRITTEN. `RadiusField` had been a slider all along —
 * `role="slider"`, arrow and Page keys, Home/End, a tap-to-set track and a fill
 * — with the behaviour welded to kilometres. Adding a second slider for the
 * overlay would have been the same interaction implemented twice, and the two
 * would have drifted the way two menus or two palettes do. So the mechanics
 * live here and `RadiusField` keeps everything that is actually about a radius:
 * its stepper buttons, its default marker, its copy.
 *
 * WHAT IT DELIBERATELY DOES NOT OWN. No label, no value readout, no unit. A
 * radius says "3 km" and an opacity says "60 %", and a component that tried to
 * format both would grow a `unit` prop and then a `format` prop. The caller
 * renders its own text and passes `valueText` for assistive tech.
 *
 * THE 44 PX TARGET IS THE ROW, NOT THE TRACK. The track is 6 px, which is a
 * hairline to hit; the pressable around it is full height, so the whole strip
 * is grabbable. Shrinking the row to the track is the classic way a slider
 * becomes unusable on a phone while looking correct in a screenshot.
 */
export type SliderProps = {
  value: number;
  min: number;
  max: number;
  /** Arrow-key increment. Page keys move by `step * 5`. */
  step: number;
  onChange: (next: number) => void;
  /** Spoken value — "3 km", "60 %". The caller owns units. */
  valueText?: string;
  /** id of the visible label, so the control is named without repeating it. */
  labelledBy?: string;
  /** A faint mark on the track, e.g. where the default sits. 0..1. */
  markAt?: number | null;
  testID?: string;
};

const TRACK_H = 6;
const MIN_TARGET = 44;

/** Snap to the step, so a drag cannot land on 0.6173. */
function quantise(v: number, min: number, max: number, step: number, fallback: number): number {
  // REFUSES NaN FIRST, and this is not defensive padding — it is the fix for a
  // real crash. `Math.max(0, NaN)` is NaN, not 0, so a clamp built out of
  // min/max does NOT sanitise a bad input: it passes it straight through. A
  // press whose event carried no `locationX` produced NaN here, which reached
  // the overlay as `opacity: NaN` and React rejected outright.
  if (!Number.isFinite(v)) return Number.isFinite(fallback) ? fallback : min;
  const snapped = min + Math.round((v - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  // Floating-point steps (0.05) accumulate error; round to the step's own
  // precision rather than leaving 0.30000000000000004 to reach a label.
  const dp = (String(step).split(".")[1] ?? "").length;
  return Number(clamped.toFixed(dp));
}

/**
 * Which value a key asks for, or null if the key is not ours.
 *
 * Exported so the mapping is testable without rendering, and so a caller that
 * hosts its own keyboard handler can defer to the same rules. Left/Down
 * decrease and Right/Up increase, which is the convention every platform
 * slider follows.
 */
export function sliderFromKey(
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
): number | null {
  const big = step * 5;
  // A broken current value must not make every key produce another one.
  const safe = Number.isFinite(value) ? value : min;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return quantise(safe + step, min, max, step, safe);
    case "ArrowLeft":
    case "ArrowDown":
      return quantise(safe - step, min, max, step, safe);
    case "PageUp":
      return quantise(safe + big, min, max, step, safe);
    case "PageDown":
      return quantise(safe - big, min, max, step, safe);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

/** react-native-web passes these through; native ignores them. */
type WebProps = { onKeyDown?: (e: { key: string; preventDefault: () => void }) => void };
const web = (p: WebProps) => p as object;

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  valueText,
  labelledBy,
  markAt = null,
  testID,
}: SliderProps) {
  const span = max - min;
  const rowRef = useRef<View | null>(null);
  const dragging = useRef(false);

  // POINTER EVENTS ON THE NODE, not `onPress`.
  //
  // It was a Pressable reading `e.nativeEvent.locationX`, which
  // react-native-web does not put on the press events this receives — so the
  // value was undefined, the arithmetic produced NaN, and once that was guarded
  // the control silently did nothing at all. `clientX` against the row's own
  // rect is the measurement that actually exists, and it is the same approach
  // MapCanvas uses to pan and the graph uses to scrub.
  //
  // It also buys the DRAG, which a slider needs and tap-to-set never gave: move
  // and up go on the document so a sweep that leaves the row keeps tracking and,
  // more importantly, still ends.
  const live = useRef({ min, max, step, span, onChange, value });
  live.current = { min, max, step, span, onChange, value };

  useEffect(() => {
    const node = rowRef.current as unknown as HTMLElement | null;
    if (!node || typeof document === "undefined") return;

    const at = (clientX: number) => {
      const r = node.getBoundingClientRect();
      if (r.width <= 0) return null;
      const L = live.current;
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return quantise(L.min + t * L.span, L.min, L.max, L.step, L.value);
    };
    const down = (e: PointerEvent) => {
      dragging.current = true;
      const next = at(e.clientX);
      if (next !== null) live.current.onChange(next);
      node.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = at(e.clientX);
      if (next !== null) live.current.onChange(next);
    };
    const up = () => {
      dragging.current = false;
    };

    node.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, []);

  // Same trap one layer up: a NaN value makes the fill's width NaN, and the
  // announced value unreadable to assistive tech.
  const safeValue = Number.isFinite(value) ? value : min;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (safeValue - min) / span)) : 0;

  return (
    <Pressable
      testID={testID}
      role="slider"
      aria-labelledby={labelledBy}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-valuetext={valueText}
      tabIndex={0}
      ref={rowRef}
      {...web({
        onKeyDown: (e) => {
          const next = sliderFromKey(e.key, value, min, max, step);
          if (next === null) return;
          e.preventDefault();
          onChange(next);
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
        {markAt === null ? null : (
          <View
            aria-hidden
            className="bg-line2"
            style={{
              position: "absolute",
              left: `${Math.min(1, Math.max(0, markAt)) * 100}%`,
              width: 1,
              top: -3,
              bottom: -3,
            }}
          />
        )}
      </View>
    </Pressable>
  );
}
