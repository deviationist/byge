import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { CellReadout } from "../components/CellReadout";
import { type LatLon, MAX_ZOOM, MapCanvas, MIN_ZOOM } from "../components/MapCanvas";
import { NavBar } from "../components/NavBar";
import { PlaybackControl } from "../components/PlaybackControl";
import { RadarGL } from "../components/RadarGL";
import { RadarLegend } from "../components/RadarLegend";
import { BASEMAP_OPTIONS, SegmentedControl } from "../components/SegmentedControl";
import type { KartverketLayer } from "../components/TileLayer";
import { ZoomControl } from "../components/ZoomControl";
import { useBack } from "../hooks/useBack";
import { useRadarField } from "../hooks/useRadarField";
import { Screen } from "../layouts/Screen";
import { useResolvedTheme } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";

/** Oslo, as a starting view. Nothing is saved here, so something has to be first. */
const START: LatLon = { lat: 60.5, lon: 9.0 };
const START_ZOOM = 7;

/**
 * The radar, with no place in mind.
 *
 * A DIFFERENT SCREEN FROM `/location/<id>/map`, not a generalisation of it, and
 * the difference is what you arrive with. That one answers "why does my place
 * say what it says" — it is anchored, it is reached from a sentence, and the
 * sentence is still the answer. This one answers "what is the weather doing",
 * which byge otherwise never asks: there is no verdict here, no place, and
 * nothing claiming to be about you.
 *
 * It exists because the overlay turned out to be useful beyond a saved
 * coordinate — at sea most of all, where the nautical chart and the coverage
 * boundary matter more than any single point. That is a different question from
 * the one the app was built around, and giving it its own screen is what stops
 * it quietly becoming the app's front door.
 *
 * THE FIELD FOLLOWS THE VIEWPORT. Pan or zoom and a new window is requested,
 * sampled to roughly one cell per two pixels — free, because MET decompresses a
 * whole frame regardless. Frames are the budget, so a national view trades them
 * for area and a close view gets all 24.
 */
export function MapScreen() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const goBack = useBack("/");
  const { width: winWidth } = useWindowDimensions();
  const phone = winWidth < 720;

  const [centre, setCentre] = useState<LatLon>(START);
  const [zoom, setZoom] = useState(START_ZOOM);
  const [basemap, setBasemap] = useState<KartverketLayer>("grey");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<LatLon | null>(null);

  const { data: field, isFetching } = useRadarField(
    size.width > 0
      ? { lat: centre.lat, lon: centre.lon, zoom, width: size.width, height: size.height }
      : null,
  );

  const frameCount = field?.frames ?? 0;

  // Clamp when a new window arrives with fewer frames than the last — a wide
  // view buys area with frames, so zooming out can leave the playhead past the
  // end, which would paint nothing at all.
  useEffect(() => {
    if (frameCount > 0 && frame >= frameCount) setFrame(frameCount - 1);
  }, [frameCount, frame]);

  useEffect(() => {
    if (!playing || frameCount <= 1) return;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(
      () =>
        setFrame((f) => {
          // Stops at the horizon rather than looping — see RadarMapScreen for
          // why the end of the data is a place worth leaving the reader.
          if (f >= frameCount - 1) {
            setPlaying(false);
            return f;
          }
          return f + 1;
        }),
      reduced ? 900 : 220,
    );
    return () => clearInterval(id);
  }, [playing, frameCount]);

  const onMoveEnd = useCallback((c: LatLon) => setCentre(c), []);

  return (
    <Screen measure={null} pad={{ top: 0, horizontal: 0, bottom: 0 }}>
      <View style={{ paddingHorizontal: phone ? 14 : 20, paddingTop: 14 }}>
        <NavBar onBack={goBack} backLabel={t("nav.backToPlaces")}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              className="text-ink font-display"
              style={{ fontSize: 20 }}
            >
              {t("map.title")}
            </Text>
            <Text
              className="text-ink3"
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.3, marginTop: 2 }}
            >
              {t("map.subtitle")}
            </Text>
          </View>
        </NavBar>
      </View>

      <View
        style={{ flex: 1, minHeight: 240, position: "relative" }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((p) => (p.width === width && p.height === height ? p : { width, height }));
        }}
      >
        <MapCanvas
          center={centre}
          zoom={zoom}
          onMove={setCentre}
          onMoveEnd={onMoveEnd}
          onZoomChange={setZoom}
          // A tap that is not a drag picks the cell under it. The map still
          // pans; this only fires when the pointer did not travel.
          onPick={setPicked}
          basemap={basemap}
          theme={theme}
          label={t("map.canvasLabel")}
          attribution={t("radarMap.attribution")}
          overlay={(v) =>
            field ? (
              <RadarGL
                field={field}
                frame={Math.min(frame, Math.max(0, field.frames - 1))}
                originX={v.originX}
                originY={v.originY}
                zoom={v.z}
                width={v.width}
                height={v.height}
                theme={theme}
              />
            ) : null
          }
        >
          <ZoomControl zoom={zoom} min={MIN_ZOOM} max={MAX_ZOOM} onChange={setZoom} />
        </MapCanvas>

        <View
          className="bg-surface border-line"
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            borderWidth: 1,
            borderRadius: 10,
            padding: 4,
          }}
        >
          <SegmentedControl<KartverketLayer>
            label={t("basemap.label")}
            labelHidden
            options={BASEMAP_OPTIONS}
            value={basemap}
            onChange={setBasemap}
          />
        </View>

        <RadarLegend theme={theme} />

        {picked ? (
          <CellReadout
            point={picked}
            frame={frame}
            theme={theme}
            onClose={() => setPicked(null)}
          />
        ) : null}
      </View>

      <View
        className="bg-surface border-t-line"
        style={{
          borderTopWidth: 1,
          paddingHorizontal: phone ? 14 : 20,
          paddingVertical: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <PlaybackControl
            playing={playing}
            onToggle={() => setPlaying((p) => !p)}
            minutes={frame * 5}
          />
          <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10 }}>
            {isFetching
              ? t("map.loadingField")
              : field
                ? t("map.sampling", { km: field.stride, frames: field.frames })
                : ""}
          </Text>
        </View>

        <Text
          className="text-ink3"
          style={{ fontFamily: MONO, fontSize: 10, lineHeight: 17, maxWidth: "70ch" as never }}
        >
          {t("map.footnote")}
        </Text>
      </View>
    </Screen>
  );
}
