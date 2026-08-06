import i18next from "i18next";
import { Text, View } from "react-native";
import type { Verdict } from "../lib/forecast";
import { isBlindVerdict } from "../lib/forecast";
import { bandFeelsLike, bandLabel, bandOf, NOTICEABLE } from "../lib/scale";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import { SWATCH, Swatch, swatchModeOf, swatchRateOf } from "./Swatch";

/**
 * The intensity badge: swatch + label + what it feels like + the number.
 *
 * It sits under the headline sentence, so it is a *qualifier*, never the answer.
 * That is why it names the sensation ("soaked in minutes") beside the rate — a
 * bare `5.7 mm/h` means nothing to anyone deciding whether to take a jacket.
 *
 * Swatch shape and colour come from `swatchModeOf`/`swatchRateOf`, the same
 * helpers the list rows use, so the badge and the row for one location can never
 * disagree about what they are showing.
 */
export type PrecipitationLevelCardProps = {
  verdict: Verdict;
  theme: Theme;
};

/** Rounded up from NOTICEABLE, so "<0.2" is true for anything below threshold. */
const TRACE_CEIL = Math.ceil(NOTICEABLE * 10) / 10;

export type LevelCopy = { label: string; feelsLike: string; rate: string };

/** Split out so the wording is testable without a renderer. */
export function levelCardCopy(v: Verdict): LevelCopy {
  if (isBlindVerdict(v)) {
    return {
      label: i18next.t("level.notObserved"),
      feelsLike: i18next.t("level.notObservedFeels"),
      // Not "0.0 mm/h". We do not have a measurement here; printing one would be
      // the single most confident wrong thing this component could say.
      rate: i18next.t("level.noRate"),
    };
  }

  const peak = swatchRateOf(v);
  const band = bandOf(v.rainingNow ? v.nowRate : peak);

  if (v.rainingNow) {
    return {
      // With the any-touch rule a wide radius reports rain from a cell kilometres
      // away. "heavy rain / soaked in minutes" would be a promise about the user
      // that the data does not make.
      label: v.edgeOnly
        ? i18next.t("level.nearby", { label: bandLabel(band) })
        : bandLabel(band),
      feelsLike: v.edgeOnly ? i18next.t("level.nearbyFeels") : bandFeelsLike(band),
      rate: i18next.t("level.rate", { rate: v.nowRate.toFixed(1) }),
    };
  }

  if (peak >= NOTICEABLE) {
    return {
      label: i18next.t("level.incoming", { label: bandLabel(band) }),
      feelsLike: bandFeelsLike(band),
      rate: i18next.t("level.peak", { rate: peak.toFixed(1) }),
    };
  }

  return {
    label: i18next.t("level.dry"),
    feelsLike: i18next.t("level.dryFeels"),
    // A flat "0.0 mm/h" beside a note about a trace at +80 min reads as a
    // contradiction. Sub-threshold moisture is real; it is just not rain.
    rate:
      peak > 0
        ? i18next.t("level.under", { rate: TRACE_CEIL.toFixed(1) })
        : i18next.t("level.rate", { rate: "0.0" }),
  };
}

export function PrecipitationLevelCard({ verdict, theme }: PrecipitationLevelCardProps) {
  const copy = levelCardCopy(verdict);

  return (
    <View
      accessibilityLabel={`${copy.label} — ${copy.feelsLike}, ${copy.rate}`}
      className="bg-surface border-line"
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 7,
        paddingLeft: 9,
        paddingRight: 14,
      }}
    >
      <Swatch
        mode={swatchModeOf(verdict)}
        rate={swatchRateOf(verdict)}
        size={SWATCH.badge}
        theme={theme}
      />

      <View style={{ gap: 1 }}>
        <Text className="text-ink" style={{ fontSize: 13, fontWeight: "500" }}>
          {copy.label}
        </Text>
        <Text className="text-ink2" style={{ fontSize: 11.5 }}>
          {copy.feelsLike}
        </Text>
      </View>

      <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 11, marginLeft: 4 }}>
        {copy.rate}
      </Text>
    </View>
  );
}
