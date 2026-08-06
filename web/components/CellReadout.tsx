import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { probe } from "../lib/radar";
import { bandFeelsLike, bandLabel, bandOf } from "../lib/scale";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import type { LatLon } from "./MapCanvas";
import { SWATCH, Swatch } from "./Swatch";

/**
 * What one cell actually reads.
 *
 * THE POINT OF FETCHING AGAIN. The painted field is quantised — one byte per
 * cell, a band index, which is all a colour can carry anyway. The moment
 * somebody asks about a specific cell they are asking a different question, and
 * "somewhere between 1 and 5.7 mm/h" is a poor answer to it. So the map is
 * lossy where lossy is invisible, and exact where it is read: this pulls the
 * real number for one coordinate, which is a 3×3 window and a few kilobytes.
 *
 * It reports the reading, NOT a verdict. There is no radius here, no saved
 * place, no spell segmentation — just what the radar has at that square. A
 * verdict is a claim about somewhere you care about, and inventing one for a
 * point somebody tapped on a map would be byge answering a question nobody
 * asked.
 */
export type CellReadoutProps = {
  point: LatLon;
  /** Which frame the map is showing. */
  frame: number;
  theme: Theme;
  onClose: () => void;
};

export function CellReadout({ point, frame, theme, onClose }: CellReadoutProps) {
  const { t } = useTranslation();

  const { data, isPending, isError } = useQuery({
    // Rounded into the key, so nudging the same cell does not refetch.
    queryKey: ["cell", point.lat.toFixed(3), point.lon.toFixed(3)],
    queryFn: ({ signal }) => probe(point.lat, point.lon, { radiusKm: 1, signal }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const f = data?.frames[Math.min(frame, (data.frames.length ?? 1) - 1)];
  // `centreRate` is the cell itself rather than the 3×3 — the question was
  // about the square that was tapped.
  const rate = f?.centreRate ?? 0;
  const blind = f ? f.observed === 0 : false;
  const band = bandOf(rate);

  return (
    <View
      testID="cell-readout"
      className="bg-surface border-line"
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        maxWidth: 260,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Swatch
          mode={blind ? "blind" : band.index === 0 ? "dry" : "now"}
          rate={rate}
          size={SWATCH.legend}
          theme={theme}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text className="text-ink" style={{ fontSize: 13 }}>
            {isPending
              ? t("cell.reading")
              : isError
                ? t("cell.unavailable")
                : blind
                  ? t("legend.hatched")
                  : bandLabel(band)}
          </Text>
          {!isPending && !isError ? (
            <Text className="text-ink2" style={{ fontSize: 11.5 }}>
              {blind ? t("legend.hatchedBody") : bandFeelsLike(band)}
            </Text>
          ) : null}
        </View>
      </View>

      {!isPending && !isError ? (
        <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10, lineHeight: 16 }}>
          {/*
            The exact rate, which is the whole reason for the second request —
            and "—" rather than "0.0" where the radar cannot see, because
            printing a measurement there is the one thing this app must not do.
          */}
          {blind ? t("level.noRate") : t("level.rate", { rate: rate.toFixed(2) })}
          {"\n"}
          {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
          {"\n"}
          {frame === 0 ? t("graph.now") : t("graph.ahead", { min: frame * 5 })}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("cell.close")}
        onPress={onClose}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          minHeight: 32,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10 }}>
          {t("cell.close")}
        </Text>
      </Pressable>
    </View>
  );
}
