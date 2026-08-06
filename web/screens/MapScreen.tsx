import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { CellReadout } from "../components/CellReadout";
import { type LatLon, MAX_ZOOM, MapCanvas, MIN_ZOOM } from "../components/MapCanvas";
import { MapLegend } from "../components/MapLegend";
import { NavBar } from "../components/NavBar";
import { PlaybackControl } from "../components/PlaybackControl";
import { RadarTilesGL } from "../components/RadarTilesGL";
import { BASEMAP_OPTIONS, SegmentedControl } from "../components/SegmentedControl";
import type { KartverketLayer } from "../components/TileLayer";
import { ZoomControl } from "../components/ZoomControl";
import { useBack } from "../hooks/useBack";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useRadarTiles } from "../hooks/useRadarTiles";
import { Screen } from "../layouts/Screen";
import { useResolvedTheme } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";

/**
 * How long one radar frame is on screen while playing, ms.
 *
 * 220 was the step interval before the playhead went continuous, and it is kept
 * so the run still takes about five seconds end to end — the change is that the
 * five seconds are now spent moving rather than in twenty-four jumps.
 */
const MS_PER_FRAME = 220;

/** Oslo, as a starting view. Nothing is saved here, so something has to be first. */
const START: LatLon = { lat: 60.5, lon: 9.0 };
const START_ZOOM = 7;

/**
 * The radar, with no place in mind.
 *
 * A DIFFERENT SCREEN FROM `/map/<id>`, not a generalisation of it, and
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
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const goBack = useBack("/");
  const { width: winWidth } = useWindowDimensions();
  const phone = winWidth < 720;

  // TWO centres, and the split is the difference between a map that pans and a
  // map that falls over.
  //
  // `centre` follows the finger and drives the render — it changes on every
  // pointermove. `view` is what the FETCH is keyed on, and it only catches up
  // when the gesture settles. Wiring the query to `centre` meant a drag minted
  // a new window every couple of pixels: a request each, and a multi-megabyte
  // field retained for each. That is what crashed the tab.
  const [centre, setCentre] = useState<LatLon>(START);
  const [view, setView] = useState<LatLon>(START);
  const [zoom, setZoom] = useState(START_ZOOM);
  const [basemap, setBasemap] = useState<KartverketLayer>("grey");
  const [size, setSize] = useState({ width: 0, height: 0 });
  // THE PLAYHEAD IS FRACTIONAL — 3.4 is 40 % of the way from frame 3 to 4, and
  // RadarGL cross-fades there. Everything that reports a frame to a human reads
  // the floored value below instead; nobody wants "frame 3.4 of 24".
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<LatLon | null>(null);

  // Only the tiles this tab does not already hold. Frame 0 paints as soon as it
  // lands and the rest arrive behind it; a pan or a zoom fetches the difference
  // rather than the whole viewport. See useRadarTiles.
  const {
    tiles,
    depth,
    expected,
    partial,
    loading,
    version,
  } = useRadarTiles(
    size.width > 0
      ? { lat: view.lat, lon: view.lon, zoom, width: size.width, height: size.height }
      : null,
  );

  // ONLY AS FAR AS EVERY VISIBLE TILE CAN GO. A ragged cache — 24 frames of the
  // square you zoomed into, fewer of its new neighbours — must not animate into
  // a hole, because a hole is indistinguishable from observed-dry.
  const frameCount = depth;
  const reduced = useReducedMotion();
  /** The whole-frame index, for anything that shows a number or reads a cell. */
  const frame = Math.min(Math.floor(playhead), Math.max(0, frameCount - 1));

  // Clamp when a new window arrives with fewer frames than the last — a wide
  // view buys area with frames, so zooming out can leave the playhead past the
  // end, which would paint nothing at all.
  useEffect(() => {
    if (frameCount > 0 && playhead > frameCount - 1) setPlayhead(frameCount - 1);
  }, [frameCount, playhead]);

  // A CONTINUOUS PLAYHEAD, not a frame counter on a timer.
  //
  // `frame` is fractional and `RadarGL` cross-fades between the two frames it
  // sits between, so this advances it by elapsed time on every animation frame
  // rather than jumping it by one every 220 ms. Radar frames are five minutes
  // apart: stepped, the eye reads a band as teleporting; faded, it reads as
  // weather moving, which is the thing the animation is for.
  //
  // Under prefers-reduced-motion it goes back to being a slideshow — a
  // cross-fade IS motion, and someone who asked for less of it should not be
  // given a smoother version. See the render, which floors the playhead there.
  useEffect(() => {
    if (!playing || frameCount <= 1) return;
    if (reduced) {
      const id = setInterval(() => setPlayhead((f) => Math.min(f + 1, frameCount - 1)), 900);
      return () => clearInterval(id);
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a huge delta, and without this
      // the run would jump most of the way to the horizon on return.
      const dt = Math.min(now - last, 250);
      last = now;
      setPlayhead((f) => Math.min(f + dt / MS_PER_FRAME, frameCount - 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameCount, reduced]);

  // Stops at the horizon rather than looping — see RadarMapScreen for why the
  // end of the data is a place worth leaving the reader.
  //
  // BUT NOT WHILE THE RUN IS STILL ARRIVING. Frames stream in, so the last one
  // we hold is usually not the last one there is; stopping there would end the
  // animation two seconds after it started and call a half-loaded run finished.
  // Sitting on the newest frame means "caught up", and playback resumes by
  // itself the moment another lands.
  useEffect(() => {
    if (playing && !partial && frameCount > 0 && playhead >= frameCount - 1) setPlaying(false);
  }, [playing, partial, playhead, frameCount]);

  // Settles a beat after the gesture stops, so a flick-and-flick-again asks
  // once rather than twice.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback((c: LatLon) => {
    setCentre(c);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setView(c), 180);
  }, []);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

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
            frameCount > 0 ? (
              <RadarTilesGL
                tiles={tiles}
                version={version}
                // Fractional while playing; floored under reduced motion so the
                // slideshow stays a slideshow. The renderer handles both.
                frame={reduced ? frame : Math.min(playhead, Math.max(0, frameCount - 1))}
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

        {/*
          Bottom-right, and its density follows the MEASURED pane rather than
          the device label — a full legend is ~240 px, so over a short map it
          would cover the thing it explains.
        */}
        <View style={{ position: "absolute", right: 12, bottom: 12 }}>
          <MapLegend theme={theme} paneHeight={size.height} />
        </View>

        {picked ? (
          <CellReadout
            point={picked}
            frame={frame}
            minutes={frame * 5}
            theme={theme}
            onClose={() => setPicked(null)}
            // The bridge back to what byge actually does: a reading becomes an
            // answer only once it has a place attached to it.
            onSave={() =>
              router.push({
                pathname: "/add",
                params: { lat: picked.lat.toFixed(4), lon: picked.lon.toFixed(4) },
              })
            }
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
            index={frame}
            count={frameCount}
            expected={expected}
            buffering={partial}
            minutes={frame * 5}
            onToggle={() => {
              // Replaying from a finished run rewinds; resuming a caught-up
              // stream does not — there is nothing behind the reader to see.
              if (!playing && !partial && playhead >= frameCount - 1) setPlayhead(0);
              setPlaying((p) => !p);
            }}
          />
          <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10 }}>
            {loading
              ? t("map.loadingField")
              : partial
                ? // Says the animation is still arriving rather than showing a
                  // frame count that is about to change under the reader.
                  t("map.loadingFrames")
                : t("map.sampling", { km: 1, frames: frameCount })}
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
