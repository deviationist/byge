import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { getItem, setItem } from "../lib/kv";
import { BANDS, colorOf, legend } from "../lib/scale";
import { HATCH, MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";

/**
 * The legend at MAP scale, which Design ruled is a different problem from the
 * legend under a list — hence a separate component from `PrecipitationLegend`
 * rather than a density prop on it.
 *
 * WHAT COLLAPSES AND WHAT DOES NOT is the whole design. Collapsed, this keeps a
 * six-band colour SPINE and drops the band names: the ramp is learnable, and
 * anyone who has seen yr's map already reads it. What it never drops is the two
 * NON-RAIN states, because those are the ones nobody can guess — "no radar" and
 * "dry" both look like absence, and absence is exactly what byge refuses to
 * leave ambiguous. So the words that survive compaction are the honest ones
 * rather than the pretty ones.
 *
 * THE TRIGGER IS LABELLED. "KEY" when collapsed, "HIDE" when open, because a
 * bare + floating over a map is not an affordance, it is a dot.
 *
 * DENSITY FOLLOWS THE MEASURED PANE, not the device label. A full legend is
 * about 240 px; over a short map it covers the thing it explains. So the caller
 * passes the height it actually has.
 */
export type MapLegendProps = {
  theme: Theme;
  /**
   * Height of the map pane in px. Below ~520 the full legend would push the
   * floating stack into the header, so it starts as a spine.
   */
  paneHeight: number;
  /** Specimens only: show the collapsed form regardless of what is remembered. */
  forceCollapsed?: boolean;
};

/** Below this, a 240 px legend is most of the map. */
const FULL_LEGEND_NEEDS = 520;

export function MapLegend({ theme, paneHeight, forceCollapsed }: MapLegendProps) {
  const { t } = useTranslation();
  const dense = paneHeight < FULL_LEGEND_NEEDS;

  // Remembered per density context. One "open" chosen on a desktop must not
  // force the full key onto a phone map that asked for the spine — a choice
  // made where there was room should not be applied where there is none.
  const key = `byge:maplegend:${dense ? "compact" : "full"}`;
  const [open, setOpen] = useState(() => {
    const stored = getItem(key);
    return stored === null ? !dense : stored === "1";
  });

  const shown = forceCollapsed ? false : open;
  const toggle = () => {
    const next = !shown;
    setOpen(next);
    setItem(key, next ? "1" : "0");
  };

  const micro = { fontFamily: MONO, fontSize: 9 } as const;

  return (
    <View
      testID="map-legend"
      className="bg-surface border-line2"
      style={{
        borderWidth: 1,
        borderRadius: 11,
        overflow: "hidden",
        alignSelf: "flex-start",
        width: shown ? 186 : undefined,
      }}
    >
      {shown ? (
        <View style={{ paddingHorizontal: 13, paddingTop: 12, paddingBottom: 13, gap: 11 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text className="text-ink3" style={[micro, { letterSpacing: 0.55 }]}>
              {t("radarMap.mmh")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("mapLegend.hide")}
              onPress={toggle}
              className="border-line"
              style={({ pressed }) => ({
                marginLeft: "auto",
                minHeight: 26,
                paddingHorizontal: 8,
                borderWidth: 1,
                borderRadius: 7,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text className="text-ink3" style={[micro, { letterSpacing: 0.45 }]}>
                {t("mapLegend.hide")}
              </Text>
              <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 11 }}>
                −
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: 5 }}>
            {legend().map((r) => (
              <View
                key={r.label}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    backgroundColor: colorOf(bandFor(r.from), theme),
                  }}
                />
                <Text className="text-ink2" style={{ fontSize: 11 }} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text
                  className="text-ink3"
                  style={[micro, { marginLeft: "auto", fontVariant: ["tabular-nums"] }]}
                  numberOfLines={1}
                >
                  {r.range}
                </Text>
              </View>
            ))}
          </View>

          {/* The two that never collapse. Kept under a rule, because they are a
              different KIND of statement from the ramp above — not levels of
              rain, but what we can and cannot say. */}
          <View className="border-t-line" style={{ borderTopWidth: 1, paddingTop: 10, gap: 6 }}>
            <NonRain
              label={t("mapLegend.dry")}
              sub={t("mapLegend.drySub")}
              swatch={
                <View
                  className="border-line2"
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: "dashed",
                  }}
                />
              }
            />
            <NonRain
              label={t("mapLegend.noRadar")}
              sub={t("mapLegend.noRadarSub")}
              swatch={
                <View
                  className="bg-nodata border-line2"
                  style={
                    {
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      borderWidth: 1,
                      backgroundImage: HATCH,
                      backgroundSize: "5px 5px",
                    } as object
                  }
                />
              }
            />
          </View>
        </View>
      ) : (
        <Pressable
          testID="map-legend-key"
          accessibilityRole="button"
          accessibilityLabel={t("mapLegend.show")}
          onPress={toggle}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingVertical: 7,
            paddingHorizontal: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {/* The spine: the ramp with its names removed. Still ordered, still
              the same colours, so it stays readable to anyone who has met it. */}
          <View aria-hidden style={{ width: 11, borderRadius: 3, overflow: "hidden" }}>
            {BANDS.filter((b) => b.index > 0).map((b) => (
              <View key={b.index} style={{ height: 6, backgroundColor: colorOf(b, theme) }} />
            ))}
          </View>

          <View style={{ gap: 4, alignItems: "flex-start" }}>
            <SpineNote
              label={t("mapLegend.noRadar")}
              swatch={
                <View
                  className="bg-nodata border-line2"
                  style={
                    {
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      borderWidth: 1,
                      backgroundImage: HATCH,
                      backgroundSize: "4px 4px",
                    } as object
                  }
                />
              }
            />
            <SpineNote
              label={t("mapLegend.dry")}
              swatch={
                <View
                  className="border-line2"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    borderWidth: 1,
                    borderStyle: "dashed",
                  }}
                />
              }
            />
          </View>

          <View style={{ alignItems: "center", gap: 2, paddingHorizontal: 3 }}>
            <Text
              className="text-ink3"
              style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 0.5 }}
            >
              {t("mapLegend.key")}
            </Text>
            <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 11 }}>
              +
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

function NonRain({
  label,
  sub,
  swatch,
}: {
  label: string;
  sub: string;
  swatch: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View style={{ marginTop: 1 }}>{swatch}</View>
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text className="text-ink" style={{ fontSize: 11 }}>
          {label}
        </Text>
        <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 9, lineHeight: 13.5 }}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function SpineNote({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {swatch}
      <Text className="text-ink2" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

/** The band a legend row's floor belongs to. */
function bandFor(from: number) {
  return BANDS.find((b) => b.floor === from) ?? BANDS[0];
}
