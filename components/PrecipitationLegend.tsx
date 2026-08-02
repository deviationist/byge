import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { bandOf, colorOf, legend } from "../lib/scale";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import { Swatch, type SwatchMode } from "./Swatch";

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
const STATES: { mode: SwatchMode; rate: number; label: string; body: string }[] = [
  {
    mode: "now",
    rate: 3,
    label: "Filled",
    body: "Raining there right now. The colour is how hard.",
  },
  {
    mode: "later",
    rate: 3,
    label: "Outline",
    body: "Dry now, but a spell is on the way within the next two hours.",
  },
  {
    mode: "blind",
    rate: 0,
    label: "Hatched",
    body: "Outside radar coverage — we have no observation at all.",
  },
];

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>{children}</View>;
}

export function PrecipitationLegend({
  theme,
  defaultOpen = false,
  onToggle,
}: PrecipitationLegendProps) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  }

  const micro = { fontFamily: MONO, fontSize: 9.5, color: "var(--color-ink3)" } as const;
  const body = { fontSize: 11.5, lineHeight: 17, color: "var(--color-ink2)" } as const;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: "var(--color-line)",
        paddingTop: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reading the list"
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
        <Text style={{ fontSize: 13, color: "var(--color-ink2)" }}>Reading the list</Text>
        <Text style={[micro, { fontSize: 12 }]}>{open ? "−" : "+"}</Text>
      </Pressable>

      {open ? (
        <View testID="legend-body" style={{ gap: 18, paddingBottom: 18, paddingTop: 2 }}>
          <View style={{ gap: 12 }}>
            {STATES.map((s) => (
              <Row key={s.mode}>
                <Swatch mode={s.mode} rate={s.rate} size={16} theme={theme} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12.5, color: "var(--color-ink)" }}>{s.label}</Text>
                  <Text style={body}>{s.body}</Text>
                </View>
              </Row>
            ))}
          </View>

          <View style={{ gap: 7 }}>
            <Text style={[micro, { letterSpacing: 0.5 }]}>HOW HARD · MM/H</Text>
            {legend().map((r) => (
              <Row key={r.label}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderColor: "var(--color-line2)",
                    // Through the same lookup the strip and the map use, so the
                    // ramp cannot drift out of step with what it explains.
                    backgroundColor: colorOf(bandOf(r.from), theme),
                  }}
                />
                <Text style={{ fontSize: 12, color: "var(--color-ink)", minWidth: 92 }}>
                  {r.label}
                </Text>
                <Text style={[body, { flex: 1 }]}>{r.feelsLike}</Text>
                <Text style={micro}>{r.range}</Text>
              </Row>
            ))}
            <Row>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: "var(--color-line2)",
                  backgroundColor: "var(--color-dry)",
                }}
              />
              <Text style={{ fontSize: 12, color: "var(--color-ink)", minWidth: 92 }}>dry</Text>
              <Text style={[body, { flex: 1 }]}>we looked, nothing is falling</Text>
              <Text style={micro}>observed</Text>
            </Row>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[micro, { letterSpacing: 0.5 }]}>NOT OBSERVED</Text>
            <Text style={body}>
              Hatching is not a level of rain and it is not dry. It means the radar mosaic
              cannot see that place at all, so byge makes no claim either way. Dry means we
              looked and saw nothing falling; hatched means we could not look.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
