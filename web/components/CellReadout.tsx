import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { FILL_THRESHOLD } from "../lib/opendap";
import { probe } from "../lib/radar";
import { bandFeelsLike, bandLabel, bandOf, colorOf } from "../lib/scale";
import { HATCH, MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import type { LatLon } from "./MapCanvas";

/**
 * What one radar cell says, and nothing more.
 *
 * IT REPORTS A READING, NEVER A VERDICT, and Design was explicit that this is
 * the whole design rather than a detail of it. A verdict is a claim about a
 * place someone told us they care about: it has a radius, a spell model, a
 * duration and a bound. A tapped square has none of those. Giving it a sentence
 * like "Rain for about 25 min" would be byge answering a question nobody asked,
 * at a point nobody said mattered — in the app's own headline voice, applied to
 * something that does not qualify for it. So: no duration, no bound, no "at
 * least", no radius, no spell segmentation. Band, feel, exact rate, where, when.
 *
 * IT ANCHORS TO THE TAPPED CELL. Parking it in a corner leaves the reader to
 * remember which square they hit, and on a running animation that link is gone
 * within two frames. The tail points at the cell, and flips above when the tap
 * lands low — the anchor is kept, the occlusion is not.
 *
 * THE EXIT IS THE SENTENCE. "Save this point as a place" is the one action, and
 * it is the bridge from browsing back to what byge actually does: a reading
 * becomes an answer only once it has a place attached to it.
 *
 * WHY IT FETCHES AGAIN. The painted field is quantised to a band, which is all
 * a colour can carry. The moment somebody asks about one square they are asking
 * a different question, and "somewhere between 1 and 5.7 mm/h" is a poor answer
 * to it. Lossy where lossy is invisible, exact where it is read.
 */
export type CellReadoutProps = {
  point: LatLon;
  /** Which frame the map is showing, and its offset in minutes. */
  frame: number;
  minutes: number;
  theme: Theme;
  /** Where the card sits relative to the cell, so the tail can point back. */
  placement?: "below" | "above";
  /** Horizontal offset of the tail within the card, px. */
  tailX?: number;
  onClose: () => void;
  /** Absent on the anchored map, where the place is already saved. */
  onSave?: () => void;
};

const WIDTH = 268;

export function CellReadout({
  point,
  frame,
  minutes,
  theme,
  placement = "below",
  tailX = 28,
  onClose,
  onSave,
}: CellReadoutProps) {
  const { t } = useTranslation();

  const { data, isPending, isError } = useQuery({
    // Rounded into the key so nudging the same cell does not refetch.
    queryKey: ["cell", point.lat.toFixed(3), point.lon.toFixed(3)],
    queryFn: ({ signal }) => probe(point.lat, point.lon, { radiusKm: 1, signal }),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 1000,
    retry: 1,
  });

  const f = data?.frames[Math.min(frame, (data.frames.length ?? 1) - 1)];
  const rate = f?.centreRate ?? 0;
  // Three states, never two. Not-covered is its own answer and it is not dry.
  const covered = f ? f.observed > 0 && rate < FILL_THRESHOLD : true;
  const band = covered ? bandOf(rate) : null;
  const above = placement === "above";

  return (
    <View testID="cell-readout" style={{ width: WIDTH, maxWidth: "100%" }}>
      <View
        className="bg-surface border-line2"
        style={{ borderWidth: 1, borderRadius: 13, overflow: "hidden" }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 12,
          }}
        >
          <View
            className={band ? undefined : "bg-nodata border-line2"}
            style={
              {
                width: 26,
                height: 26,
                borderRadius: 5,
                marginTop: 2,
                borderWidth: band ? 0 : 1,
                backgroundColor: band ? colorOf(band, theme) : undefined,
                ...(covered ? null : { backgroundImage: HATCH, backgroundSize: "5px 5px" }),
              } as object
            }
          />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text
              className="text-ink font-display"
              style={{ fontSize: 20, fontWeight: "300", lineHeight: 23, letterSpacing: -0.2 }}
            >
              {isPending
                ? t("cell.reading")
                : isError
                  ? t("cell.unavailable")
                  : !covered
                    ? t("cell.notObserved")
                    : band && band.index > 0
                      ? bandLabel(band)
                      : t("cell.dry")}
            </Text>
            {!isPending && !isError ? (
              <Text className="text-ink2" style={{ fontSize: 12.5, lineHeight: 18 }}>
                {!covered
                  ? t("cell.notObservedBody")
                  : band && band.index > 0
                    ? bandFeelsLike(band)
                    : t("cell.dryBody")}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("cell.close")}
            onPress={onClose}
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              marginTop: -3,
              marginRight: -3,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text aria-hidden className="text-ink3" style={{ fontSize: 15, lineHeight: 18 }}>
              ×
            </Text>
          </Pressable>
        </View>

        {!isPending && !isError ? (
          <View
            className="border-t-line"
            style={{ borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap" }}
          >
            <Fact
              k={t("cell.rate")}
              v={covered ? t("level.rate", { rate: rate.toFixed(1) }) : "—"}
            />
            <Fact
              k={t("cell.frame")}
              v={`${minutes === 0 ? t("graph.now") : t("graph.ahead", { min: minutes })} · ${clockAt(minutes)}`}
            />
            <Fact k={t("cell.cell")} v={`${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`} />
            <Fact k={t("cell.resolution")} v={t("cell.resolutionValue")} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 12, gap: 10 }}>
          {/* Says what this is NOT, in the same breath as what it is. Without
              it the card looks like a small verdict, which is the one reading
              of it Design ruled out. */}
          <Text
            className="text-ink3"
            style={{ fontFamily: MONO, fontSize: 9.5, lineHeight: 16 }}
          >
            {t("cell.disclaimer")}
          </Text>
          {onSave ? (
            <Pressable
              testID="cell-save"
              accessibilityRole="button"
              accessibilityLabel={t("cell.save")}
              onPress={onSave}
              className="border-line2"
              style={({ pressed }) => ({
                minHeight: 40,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text className="text-ink" style={{ fontSize: 13 }}>
                {t("cell.save")}
              </Text>
              <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 11 }}>
                →
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* The tether. A rotated square rather than a triangle, so it inherits the
          card's border on two sides and reads as part of it. */}
      <View
        aria-hidden
        className="bg-surface border-line2"
        style={{
          position: "absolute",
          left: tailX,
          ...(above ? { bottom: -6 } : { top: -6 }),
          width: 10,
          height: 10,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          transform: [{ rotate: above ? "45deg" : "225deg" }],
        }}
      />
    </View>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View
      className="border-r-line border-b-line"
      style={{
        width: "50%",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        gap: 3,
        minWidth: 0,
      }}
    >
      <Text
        className="text-ink3"
        style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.6 }}
      >
        {k}
      </Text>
      <Text
        className="text-ink"
        style={{ fontFamily: MONO, fontSize: 11.5, fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
      >
        {v}
      </Text>
    </View>
  );
}

function clockAt(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}
