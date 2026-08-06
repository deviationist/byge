import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { bandOf, colorOf, legend } from "../lib/scale";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import { SWATCH, Swatch, type SwatchMode } from "./Swatch";

/**
 * "Reading the list" — a collapsed disclosure beneath the locations list.
 *
 * Collapsed, because nothing in byge is explained *only* here: every list row
 * carries its status in words beside the swatch, and the verdict badge spells
 * out label, feeling and rate together. The colours and shapes are scanning
 * aids, never the sole carrier — which makes this one-time orientation, and
 * one-time things can be collapsed.
 *
 * But a disclosure *in position*, not a "?" in the nav bar. A labelled row where
 * the legend would be is discoverable; a corner icon is hidden and nobody taps
 * it.
 *
 * This is now the ONLY place the three shapes are explained — the masthead's
 * one-line key was dropped rather than say it twice on one screen. Two things
 * make that safe. The paragraph above: no shape is ever the sole carrier of
 * anything, so failing to read this card costs a reader nothing. And the three
 * swatches in the collapsed header, which is what turns "a row you might open"
 * into "the thing that explains those little squares".
 *
 * Not "markers": that word means map pin once `MapField` and `RadarMap` exist,
 * and this explains list glyphs. `Swatch` in code and in copy, here and
 * everywhere.
 */
export type PrecipitationLegendProps = {
  theme: Theme;
  defaultOpen?: boolean;
  /** So a screen can remember the state without this owning storage. */
  onToggle?: (open: boolean) => void;
};

/** The three shapes. `dry` lives in the ramp below, where the absence belongs. */
// Built at RENDER rather than as a module constant: a constant would call t()
// at import time, which can precede i18n init and would pin English into a
// value no language switch could reach.
function statesOf(
  t: TFunction,
): { mode: SwatchMode; rate: number; label: string; body: string }[] {
  return [
    { mode: "now", rate: 3, label: t("legend.filled"), body: t("legend.filledBody") },
    { mode: "later", rate: 3, label: t("legend.outline"), body: t("legend.outlineBody") },
    { mode: "blind", rate: 0, label: t("legend.hatched"), body: t("legend.hatchedBody") },
  ];
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>{children}</View>;
}

export function PrecipitationLegend({
  theme,
  defaultOpen = false,
  onToggle,
}: PrecipitationLegendProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const states = statesOf(t);

  function toggle() {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  }

  const micro = { fontFamily: MONO, fontSize: 9.5 } as const;
  const body = { fontSize: 11.5, lineHeight: 17 } as const;

  return (
    // A card, matching every other surface in the app. It was a bare row on a
    // hairline rule, which read as the end of the list rather than as a thing
    // you could open.
    <View
      className="bg-surface border-line"
      style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 }}
    >
      <Pressable
        accessibilityRole="button"
        // The NAME stays put and `aria-expanded` carries the state — that is the
        // disclosure contract. Swapping the name to "Show/Hide…" on toggle would
        // make the control appear to be a different control each press.
        accessibilityLabel={t("legend.title")}
        aria-expanded={open}
        onPress={toggle}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text className="text-ink2" style={{ fontSize: 13 }}>
          {t("legend.title")}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/*
            The three shapes sit in the collapsed header, so the card shows what
            it is about before you open it. Decorative here — each one is
            labelled in words the moment the card expands, and the list rows
            beside it already carry their status in words.
          */}
          <View aria-hidden style={{ flexDirection: "row", gap: 5 }}>
            {states.map((s) => (
              <Swatch
                key={s.mode}
                mode={s.mode}
                rate={s.rate}
                size={SWATCH.legendInline}
                theme={theme}
              />
            ))}
          </View>
          <Text className="text-ink3" style={[micro, { fontSize: 13 }]}>
            {open ? "−" : "+"}
          </Text>
        </View>
      </Pressable>

      {open ? (
        <View testID="legend-body" style={{ gap: 18, paddingBottom: 18, paddingTop: 2 }}>
          <View style={{ gap: 12 }}>
            {states.map((s) => (
              <Row key={s.mode}>
                <Swatch mode={s.mode} rate={s.rate} size={SWATCH.legend} theme={theme} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text className="text-ink" style={{ fontSize: 12.5 }}>
                    {s.label}
                  </Text>
                  <Text className="text-ink2" style={body}>
                    {s.body}
                  </Text>
                </View>
              </Row>
            ))}
          </View>

          <View style={{ gap: 7 }}>
            <Text className="text-ink3" style={[micro, { letterSpacing: 0.5 }]}>
              {t("legend.ramp")}
            </Text>
            {legend().map((r) => (
              <Row key={r.label}>
                <View
                  className="border-line2"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 1,
                    // Through the same lookup the strip and the map use, so the
                    // ramp cannot drift out of step with what it explains.
                    backgroundColor: colorOf(bandOf(r.from), theme),
                  }}
                />
                <Text className="text-ink" style={{ fontSize: 12, minWidth: 92 }}>
                  {r.label}
                </Text>
                <Text className="text-ink2" style={[body, { flex: 1 }]}>
                  {r.feelsLike}
                </Text>
                <Text className="text-ink3" style={micro}>
                  {r.range}
                </Text>
              </Row>
            ))}
            <Row>
              <View
                className="border-line2 bg-dry"
                style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1 }}
              />
              <Text className="text-ink" style={{ fontSize: 12, minWidth: 92 }}>
                {t("legend.dry")}
              </Text>
              <Text className="text-ink2" style={[body, { flex: 1 }]}>
                {t("legend.dryFeels")}
              </Text>
              <Text className="text-ink3" style={micro}>
                {t("legend.dryRange")}
              </Text>
            </Row>
          </View>

          <View style={{ gap: 6 }}>
            <Text className="text-ink3" style={[micro, { letterSpacing: 0.5 }]}>
              {t("legend.notObserved")}
            </Text>
            <Text className="text-ink2" style={body}>
              {t("legend.notObservedBody")}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
