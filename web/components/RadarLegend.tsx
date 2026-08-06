import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { bandOf, colorOf, legend } from "../lib/scale";
import { HATCH, MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";

/**
 * The mm/h key, floated over the radar map.
 *
 * GENERATED FROM THE PALETTE, never from the colours that happen to arrive in
 * the data. It reads the same `legend()` the list's expandable card does, so
 * the map cannot disagree with the sentence above it about what a colour means
 * — which is the one way a legend can actively mislead.
 *
 * It carries two rows the intensity ramp does not: no coverage, and observed
 * dry. Those are the two things a reader will otherwise invent an explanation
 * for. Hatching is unmistakably not a colour on the ramp, and untouched
 * basemap is unmistakably not hatching, but only if something says so.
 */
export type RadarLegendProps = {
  theme: Theme;
};

export function RadarLegend({ theme }: RadarLegendProps) {
  const { t } = useTranslation();
  const micro = { fontFamily: MONO, fontSize: 9 } as const;

  const rows = legend().map((r) => ({
    key: r.label,
    label: r.label,
    range: r.range,
    background: colorOf(bandOf(r.from), theme),
    hatched: false,
    className: "border-line2",
  }));

  return (
    <View
      testID="radar-legend"
      className="bg-surface border-line"
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        maxWidth: 210,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        gap: 7,
      }}
    >
      <Text className="text-ink3" style={[micro, { letterSpacing: 0.45 }]}>
        {t("radarMap.mmh")}
      </Text>

      {rows.map((r) => (
        <Row key={r.key} label={r.label} range={r.range}>
          <View
            className={r.className}
            style={{
              width: 13,
              height: 13,
              borderRadius: 3,
              borderWidth: 1,
              backgroundColor: r.background,
            }}
          />
        </Row>
      ))}

      {/* Not an intensity, and never folded into the ramp above. */}
      <Row label={t("legend.hatched")} range={t("legend.dryRange2")}>
        <View
          className="bg-nodata border-nodata-line"
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
      </Row>

      <Row label={t("legend.dry")} range={t("legend.dryRange")}>
        <View
          className="bg-dry border-line2"
          style={{ width: 13, height: 13, borderRadius: 3, borderWidth: 1 }}
        />
      </Row>
    </View>
  );
}

function Row({
  label,
  range,
  children,
}: {
  label: string;
  range: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {children}
      <Text className="text-ink2" style={{ fontSize: 10.5 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="text-ink3"
        style={{ fontFamily: MONO, fontSize: 9, marginLeft: "auto" }}
        numberOfLines={1}
      >
        {range}
      </Text>
    </View>
  );
}
