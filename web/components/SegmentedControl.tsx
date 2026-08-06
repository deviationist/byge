import i18next from "i18next";
import { useId, useRef } from "react";
import type { TextStyle, View as ViewType } from "react-native";
import { Pressable, Text, View } from "react-native";
import { MONO } from "../theme/tokens";
import type { ThemeChoice } from "../theme/useTheme";
import type { KartverketLayer } from "./TileLayer";

/**
 * One component, two uses: the appearance choice in About, and the phase-2
 * basemap switcher on RadarMap. Generic over the option value so neither call
 * site has to widen to `string` and lose its own union.
 *
 * Built as a **radio group**, not a row of buttons: a segmented control is one
 * question with N answers, and the radio pattern is what makes arrow keys work
 * and what tells a screen reader "3 of 4" rather than reading four unrelated
 * buttons.
 *
 * The selected segment is marked with a check glyph as well as a fill. The
 * basemap switcher sits on top of a map where the surrounding colour is not
 * ours to control, so a fill alone is not a reliable signal even for someone
 * with full colour vision.
 */
export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Spoken-only detail, for a label that cannot say enough on its own. */
  hint?: string;
};

export type SegmentedControlProps<T extends string> = {
  /** Accessible name for the group. The segments alone never say what they choose. */
  label: string;
  /**
   * Hide the visible label but keep the accessible one. For the map overlay,
   * where the control floats over the basemap and a caption would be clutter.
   */
  labelHidden?: boolean;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

/**
 * react-native-web forwards these to the DOM but React Native's types have no
 * notion of them. Typed rather than `any` so the handler still checks.
 */
type WebProps = {
  onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
  "aria-describedby"?: string;
};
const web = (p: WebProps) => p as object;

const MIN_TARGET = 44;

/**
 * Off-screen but still spoken.
 *
 * `accessibilityHint` looks like the right prop for this and is what React
 * Native documents — but react-native-web does not implement it at all (the
 * string appears nowhere in its output), so passing it would ship a hint that
 * silently reaches nobody. A referenced hidden node is the version that works.
 */
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
} as const;

export const themeOptions = (): readonly SegmentedOption<ThemeChoice>[] => [
  { value: "light", label: i18next.t("appearance.light") },
  { value: "dark", label: i18next.t("appearance.dark") },
  {
    value: "system",
    label: i18next.t("appearance.system"),
    hint: i18next.t("appearance.systemHint"),
  },
];

/**
 * The basemap options, which are the layers that actually exist.
 *
 * This list used to read `terrain / street / satellite / hybrid` — the design's
 * sketch of what a map switcher might offer, hardcoded in English and wired to
 * nothing but its own test. It also declared a second type named `Basemap`,
 * shadowing the real one in MapCanvas, so the codebase held two contradictory
 * answers to "what is a basemap" and the wrong one was the one you found first.
 *
 * `satellite` and `hybrid` are gone because there is no aerial layer to point
 * them at: Kartverket's open cache serves four layers and all four are maps.
 * See the note in TileLayer.
 */
export const BASEMAP_OPTIONS: readonly SegmentedOption<KartverketLayer>[] = [
  { value: "grey", label: i18next.t("basemap.grey"), hint: i18next.t("basemap.greyHint") },
  { value: "topo", label: i18next.t("basemap.topo") },
  {
    value: "detailed",
    label: i18next.t("basemap.detailed"),
    hint: i18next.t("basemap.detailedHint"),
  },
  {
    value: "nautical",
    label: i18next.t("basemap.nautical"),
    hint: i18next.t("basemap.nauticalHint"),
  },
];

/**
 * Where an arrow key should land. Wraps, because a group of three that stops
 * dead at each end makes the user reverse direction to reach the option they
 * just passed.
 *
 * Returns `null` for keys that are not ours — the caller must leave Tab alone
 * or the control becomes a keyboard trap.
 */
export function nextIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const LABEL: TextStyle = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

export function SegmentedControl<T extends string>({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const refs = useRef<(ViewType | null)[]>([]);

  const selected = options.findIndex((o) => o.value === value);
  // Roving tabindex: the group is one Tab stop. If every segment were tabbable,
  // a four-option control would cost four Tab presses to step past.
  const tabStop = selected < 0 ? 0 : selected;

  function move(key: string, from: number) {
    const to = nextIndex(key, from, options.length);
    if (to === null) return false;
    onChange(options[to].value);
    // Focus follows selection, per the radio-group pattern. Without this the
    // value moves but focus stays put, so the next arrow press starts from the
    // wrong segment and the control feels stuck.
    (refs.current[to] as unknown as HTMLElement | null)?.focus();
    return true;
  }

  return (
    <View style={{ gap: 9 }}>
      {labelHidden ? null : (
        <Text nativeID={labelId} className="text-ink3" style={LABEL}>
          {label}
        </Text>
      )}

      <View
        testID={testID}
        role="radiogroup"
        aria-label={labelHidden ? label : undefined}
        aria-labelledby={labelHidden ? undefined : labelId}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
      >
        {options.map((option, i) => {
          const on = option.value === value;
          const hintId = `${id}-hint-${option.value}`;
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                refs.current[i] = node;
              }}
              role="radio"
              aria-checked={on}
              accessibilityLabel={option.label}
              tabIndex={i === tabStop ? 0 : -1}
              onPress={() => onChange(option.value)}
              {...web({
                "aria-describedby": option.hint ? hintId : undefined,
                onKeyDown: (e) => {
                  if (move(e.key, i)) e.preventDefault();
                },
              })}
              className={on ? "bg-ink border-ink" : "bg-transparent border-line2"}
              style={({ pressed }) => ({
                minHeight: MIN_TARGET,
                minWidth: MIN_TARGET,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {/* Shape, not just fill. aria-hidden because aria-checked has
                  already told assistive tech what this glyph is for. */}
              {on ? (
                <Text aria-hidden className="text-bg" style={{ fontSize: 11 }}>
                  ✓
                </Text>
              ) : null}
              <Text
                className={on ? "text-bg" : "text-ink2"}
                style={{ fontSize: 12.5, fontWeight: on ? "500" : "400" }}
              >
                {option.label}
              </Text>
              {option.hint ? (
                <Text nativeID={hintId} style={SR_ONLY}>
                  {option.hint}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
