import i18next from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { OverflowMenu } from "./OverflowMenu";
import { Slider } from "./Slider";
import type { KartverketLayer } from "./TileLayer";
import type { Theme } from "../theme/useTheme";

/**
 * Which basemap sits under the radar.
 *
 * A DROPDOWN, NOT A ROW OF BOXES. It was a `SegmentedControl` in a card pinned
 * to the top-left of the map, which cost about 340 px of the widest thing on
 * the screen to show four options only one of which is ever in use. The design
 * makes it a labelled trigger that opens a menu, and the width it gives back is
 * the point: the map is the content, and its chrome should not occupy a quarter
 * of the top edge to say what it is already showing.
 *
 * IT REUSES `OverflowMenu`. That component already carries the popover, the
 * Escape handling, focus return to the trigger and roving focus between rows,
 * and it grew a `triggerText` prop precisely so it could serve a labelled
 * dropdown as well as the bare `⋯` glyph. A second near-identical menu is how
 * two menus drift apart.
 *
 * THE NOTES ARE THE POINT of using a menu rather than a segmented control.
 * "Nautical · official sea charts" tells a reader at sea that the option is for
 * them; a four-letter segment label cannot. The current one says "· showing",
 * because a menu that closes on selection needs to state what it left you with.
 */
export type BasemapMenuProps = {
  value: KartverketLayer;
  onChange: (next: KartverketLayer) => void;
  /** Whether the precipitation layer is drawn at all. */
  radar: boolean;
  onRadarChange: (next: boolean) => void;
  /** How opaque it is when it is. See OPACITY_MIN/MAX. */
  opacity: number;
  onOpacityChange: (next: number) => void;
  theme: Theme;
};

/**
 * The range the overlay may take, and why it stops short at both ends.
 *
 * NEVER ZERO, because that is what the layer toggle is for. An overlay faded to
 * nothing looks exactly like a clear sky, and nothing on screen would say the
 * data had been hidden rather than being absent — the confident wrong answer
 * this app is built to refuse. Turning the layer OFF is explicit and the screen
 * says so; fading it to invisible is not.
 *
 * NEVER FULLY OPAQUE either: at 100 % the basemap under it is gone, and the
 * reason to have a basemap at all is to know where the rain is.
 */
export const OPACITY_MIN = 0.1;
export const OPACITY_MAX = 0.9;
export const OPACITY_STEP = 0.1;

/**
 * Built at call time, never as a module constant.
 *
 * `BASEMAP_OPTIONS` was a `const` that called `t()` at import, which can precede
 * i18n init — pinning English into a value no language switch can reach. Exactly
 * the bug the About screen documents for its own labels. It is a function here
 * so the four names follow the language like everything else.
 */
export function basemapOptions(): { value: KartverketLayer; label: string; note: string }[] {
  return [
    { value: "grey", label: i18next.t("basemap.grey"), note: i18next.t("basemap.greyHint") },
    { value: "topo", label: i18next.t("basemap.topo"), note: i18next.t("basemap.topoHint") },
    {
      value: "detailed",
      label: i18next.t("basemap.detailed"),
      note: i18next.t("basemap.detailedHint"),
    },
    {
      value: "nautical",
      label: i18next.t("basemap.nautical"),
      note: i18next.t("basemap.nauticalHint"),
    },
    // Last, because it is the fallback rather than the best: Kartverket is
    // better over Norway, and this is the only one that works anywhere else.
    {
      value: "nordic",
      label: i18next.t("basemap.nordic"),
      note: i18next.t("basemap.nordicHint"),
    },
  ];
}

export function BasemapMenu({
  value,
  onChange,
  radar,
  onRadarChange,
  opacity,
  onOpacityChange,
  theme,
}: BasemapMenuProps) {
  const { t } = useTranslation();
  const options = basemapOptions();
  const current = options.find((o) => o.value === value) ?? options[0];
  const pct = Math.round(opacity * 100);
  const opacityId = useId();

  return (
    <OverflowMenu
      theme={theme}
      label={t("basemap.label")}
      menuLabel={t("basemap.label")}
      // The design's trigger reads `LAYER  Muted  ⌄`. The eyebrow and the caret
      // live in MoreButton's labelled shape, so what is passed is the value.
      triggerText={current.label}
      align="start"
      // Upward: the trigger sits at the foot of the map, and a panel opening
      // downward from there is drawn off the bottom of the screen — which reads
      // as a control that flickers and refuses to open.
      direction="up"
      footer={
        // Disabled rather than hidden when the layer is off. A control that
        // vanishes leaves the reader wondering where it went; one that is
        // visibly unavailable says why — there is nothing to make more or less
        // opaque.
        <View style={{ gap: 6, opacity: radar ? 1 : 0.4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text nativeID={opacityId} className="text-ink2" style={{ fontSize: 12 }}>
              {t("basemap.opacity")}
            </Text>
            <Text
              className="text-ink3 font-mono"
              style={{ fontSize: 11, fontVariant: ["tabular-nums"] }}
            >
              {t("basemap.opacityValue", { pct })}
            </Text>
          </View>
          <Slider
            testID="radar-opacity"
            value={opacity}
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            onChange={onOpacityChange}
            labelledBy={opacityId}
            valueText={t("basemap.opacityValue", { pct })}
          />
        </View>
      }
      items={[
        // The precipitation layer sits with the others, because it IS one — and
        // being able to turn it off is the honest version of an opacity that
        // reaches zero.
        {
          key: "radar",
          label: t("basemap.radar"),
          hint: radar ? t("basemap.radarOn") : t("basemap.radarOff"),
          onSelect: () => onRadarChange(!radar),
        },
      ].concat(options.map((o) => ({
        key: o.value,
        label: o.label,
        // The selected row says so in its own note rather than with a tick: the
        // menu is closed most of the time, and the trigger already carries the
        // answer, so a tick would be the second place to look for one fact.
        hint: o.value === value ? t("basemap.showing", { note: o.note }) : o.note,
        onSelect: () => onChange(o.value),
      })))}
    />
  );
}
