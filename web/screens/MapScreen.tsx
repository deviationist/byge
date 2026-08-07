import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { CellReadout } from "../components/CellReadout";
import { type LatLon, MAX_ZOOM, MapCanvas, metersPerPixel, MIN_ZOOM } from "../components/MapCanvas";
import { MapLegend } from "../components/MapLegend";
import { NavBar } from "../components/NavBar";
import { PlaybackControl } from "../components/PlaybackControl";
import { RadarTilesGL } from "../components/RadarTilesGL";
import { BasemapMenu } from "../components/BasemapMenu";
import { creditFor, type KartverketLayer } from "../components/TileLayer";
import { ZoomControl } from "../components/ZoomControl";
import { useBack } from "../hooks/useBack";
import { useLocations } from "../hooks/useLocations";
import { useVerdict } from "../hooks/useVerdict";
import { PrecipitationGraph } from "../components/PrecipitationGraph";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useRadarTiles } from "../hooks/useRadarTiles";
import { loadMapView, saveMapView } from "../lib/mapView";
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

/**
 * How long the horizon frame holds before the run wraps, ms.
 *
 * THE LAST FRAME NEVER GOT ITS TURN. Playback stopped the moment the playhead
 * REACHED `frameCount - 1`, so +115 was on screen for one animation frame and
 * then the run was over — you could not pause on it, and it read as a reset
 * rather than as an ending. It is also the single most important frame on the
 * screen: it is where the data runs out, the same edge the verdict means by "no
 * end in sight".
 *
 * Four steps' worth, so it registers as a deliberate pause rather than a stall.
 */
const HORIZON_DWELL_MS = MS_PER_FRAME * 4;

/** Oslo, as a starting view. Nothing is saved here, so something has to be first. */
const START: LatLon = { lat: 60.5, lon: 9.0 };
const START_ZOOM = 7;

/**
 * How the layers start, before anyone has chosen.
 *
 * 0.8 rather than the 0.82 the overlay was fixed at, because opacity now moves
 * in tenths and a default that is not on the control's own grid shows a slider
 * sitting between its ticks.
 */
const LAYER_DEFAULTS = { basemap: "grey", radar: true, radarOpacity: 0.8 } as const;

/** The layer names this build knows, so a stale saved one is dropped. */
const BASEMAP_NAMES = ["none", "grey", "topo", "detailed", "nautical"] as const;

/** Close enough that a 3 km radius ring reads as a ring. */
const PLACE_ZOOM = 9;

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
export type MapScreenProps = {
  /**
   * A saved place to mark, or nothing.
   *
   * THE ONLY DIFFERENCE BETWEEN THE TWO MAP ROUTES. `/map/<id>` used to be a
   * second implementation — a 51x51 float probe painted on a 2D canvas at a
   * fixed zoom, with no pan, no cell picking and an integer playhead — so it
   * was the worse map on every axis and a fix to one was not a fix to the
   * other. It is now this screen with a marker on it.
   */
  placeId?: string;
};

export function MapScreen({ placeId }: MapScreenProps = {}) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { byId } = useLocations();
  const place = byId(placeId);
  // The verdict's own reading of the saved disc, for the strip. A small window
  // at the saved radius — nothing like the 51x51 float grid this screen used to
  // fetch to paint with.
  const { data: verdict } = useVerdict(place);
  // Back to the verdict when we came from one; to the list otherwise.
  const goBack = useBack(place ? `/location/${place.id}` : "/");
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
  // Opens on the place when there is one, and close enough that its radius ring
  // is legible rather than a dot. It is a starting VIEW, not a lock: the map
  // pans and zooms away from it exactly like the unanchored one, because the
  // question "what is coming toward my cabin" is answered by looking around it.
  // The place wins; otherwise where this browser was last looking; otherwise
  // the default view. Read once via lazy state, so a later save cannot yank the
  // map back to a stale position mid-session.
  const [saved] = useState(() =>
    place ? null : loadMapView(MIN_ZOOM, MAX_ZOOM, BASEMAP_NAMES, LAYER_DEFAULTS),
  );
  const start = place ? { lat: place.lat, lon: place.lon } : (saved ?? START);
  const [centre, setCentre] = useState<LatLon>(start);
  const [view, setView] = useState<LatLon>(start);
  const [zoom, setZoom] = useState(place ? PLACE_ZOOM : (saved?.zoom ?? START_ZOOM));
  // The DETAIL sheet, on top of a base that is always there. Defaulting to the
  // muted Kartverket sheet costs nothing outside Norway — it is transparent
  // there — so there is no longer a reason for this screen and the add-a-place
  // picker to open on different layers.
  const [basemap, setBasemap] = useState<KartverketLayer>(
    (saved?.basemap as KartverketLayer) ?? LAYER_DEFAULTS.basemap,
  );
  // PRECIPITATION IS A LAYER, so it can be turned off like any other. Off is an
  // explicit state rather than an opacity of zero, which would look exactly
  // like a clear sky — see the note where the screen says so.
  const [radar, setRadar] = useState(saved?.radar ?? LAYER_DEFAULTS.radar);
  const [radarOpacity, setRadarOpacity] = useState(
    saved?.radarOpacity ?? LAYER_DEFAULTS.radarOpacity,
  );
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
      // Same loop, same dwell, in whole steps: the horizon gets one extra beat
      // before the wrap rather than four, because at 900 ms a step is already
      // long enough to read.
      let held = false;
      const id = setInterval(() => {
        setPlayhead((f) => {
          if (f < frameCount - 1) {
            held = false;
            return f + 1;
          }
          if (!held) {
            held = true;
            return f;
          }
          held = false;
          return 0;
        });
      }, 900);
      return () => clearInterval(id);
    }
    let raf = 0;
    let last = performance.now();
    let dwell = 0;
    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a huge delta, and without this
      // the run would jump most of the way to the horizon on return.
      const dt = Math.min(now - last, 250);
      last = now;
      const max = frameCount - 1;
      setPlayhead((f) => {
        if (f < max) {
          dwell = 0;
          return Math.min(f + dt / MS_PER_FRAME, max);
        }
        // At the horizon: hold, then wrap. Holding is what makes the last frame
        // legible and pausable; wrapping is what makes it a loop.
        dwell += dt;
        if (dwell < HORIZON_DWELL_MS) return max;
        dwell = 0;
        return 0;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameCount, reduced]);

  // IT LOOPS, and that overrides a design ruling deliberately.
  //
  // Design confirmed stopping at the horizon twice: "looping is the convention
  // and the convention is wrong here — it turns a two-hour forecast into
  // wallpaper and erases the single most important frame, where the data runs
  // out." That reasoning is good, and it was asked for anyway: in practice the
  // run is five seconds long and reaching for REPLAY every five seconds to
  // watch a band cross the country is friction, not emphasis.
  //
  // What is kept is the POINT of the ruling rather than its mechanism. The
  // horizon frame holds for four steps before the wrap — long enough to read,
  // long enough to pause on — so the end of the data is still a moment rather
  // than a seam. The dwell lives in the playback loop above.

  /**
   * Move the playhead by whole frames, and stop playing.
   *
   * Stepping pauses for the same reason scrubbing does: fighting an animation
   * for control of the thing you are moving is the worst version of both, and
   * the reader has just said which frame they want. Clamped rather than
   * wrapped — the run loops on its own, but an explicit step should never
   * teleport across the whole two hours.
   */
  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setPlayhead((p) => {
        const max = Math.max(0, frameCount - 1);
        return Math.min(max, Math.max(0, Math.round(p) + delta));
      });
    },
    [frameCount],
  );

  // ARROW KEYS, because a map you can only scrub with a pointer is a map half
  // the people using it cannot read frame by frame.
  //
  // Bound on the window rather than on the canvas: the transport, the graph and
  // the map are three focusable things for one timeline, and requiring the
  // right one to be focused first is a puzzle. Guarded so it never steals a
  // keystroke from a text field — the add-a-place screen shares this app.
  useEffect(() => {
    if (frameCount <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      // THE MAP KEEPS ITS ARROWS WHEN IT HAS FOCUS. MapCanvas binds all four for
      // panning, and both listeners would otherwise fire on one keypress — the
      // view sliding east while the playhead stepped forward. Focus the map and
      // the arrows pan, which is what a focused map should do; focus anything
      // else, or nothing, and they move the timeline.
      if (el?.closest?.('[aria-roledescription="map"]')) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Home") step(-frameCount);
      else if (e.key === "End") step(frameCount);
      else if (e.key === " " || e.key === "k") setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, frameCount]);

  // Settles a beat after the gesture stops, so a flick-and-flick-again asks
  // once rather than twice.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback((c: LatLon) => {
    setCentre(c);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setView(c), 180);
  }, []);

  // REMEMBER WHERE THIS MAP WAS LOOKING, but only the unanchored one — `/map/<id>`
  // opens on its place, and restoring a saved viewport there would answer a
  // question about somewhere else.
  //
  // Keyed on the SETTLED view rather than on `centre`, so a drag writes once
  // when it stops instead of on every pointermove. Design's rule that the app
  // must not remember the map as "where I was" is about routes, and is
  // untouched: the launcher still opens the list.
  useEffect(() => {
    if (place) return;
    saveMapView({ lat: view.lat, lon: view.lon, zoom, basemap, radar, radarOpacity });
  }, [place, view, zoom, basemap, radar, radarOpacity]);
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
              style={{ fontSize: phone ? 21 : 25, lineHeight: (phone ? 21 : 25) * 1.1 }}
            >
              {place ? place.name : t("map.title")}
            </Text>
            {/*
              The screen states its own limit, which is Design's ruling for the
              unanchored map and reads just as true here: this is the field, not
              a verdict about it. With a place we say which place instead — the
              verdict for it is one back-tap away and does the claiming.
            */}
            <Text
              className="text-ink3"
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                lineHeight: 14,
                letterSpacing: 0.3,
                marginTop: 3,
                maxWidth: "30ch" as never,
              }}
            >
              {place ? t("radarMap.subtitle") : t("map.subtitle")}
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
          attribution={t("radarMap.attribution", { basemap: creditFor(basemap) })}
          overlay={(v) =>
            radar && frameCount > 0 ? (
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
                opacity={radarOpacity}
              />
            ) : null
          }
        >
          {/*
            THE PLACE, and nothing more. `/map/<id>` used to fetch a separate
            51x51 float window to paint at a fixed zoom; the radar here is the
            same tiled field the unanchored map draws, and the id only adds
            these two marks.

            The ring is the disc the verdict is about, drawn in the band palette
            like the add-a-place picker's, so the circle reads as belonging to
            the weather it reports on. Sized from the projection rather than
            assumed, so it stays true through a zoom.
          */}
          {place ? <PlaceMark place={place} zoom={zoom} /> : null}
          <ZoomControl zoom={zoom} min={MIN_ZOOM} max={MAX_ZOOM} onChange={setZoom} />
        </MapCanvas>

        {/*
          Bottom-left, where the design puts it — the top edge belongs to the
          screen's own name, and a picker up there competed with it.

          ONE FLOATING THING AT A TIME ON A PHONE. The design is explicit: when
          a readout opens, the basemap switcher yields. On a 390 px screen the
          readout, the legend and the picker cannot all sit over the map without
          burying the thing they annotate — and the readout is the one the
          reader just asked for.
        */}
        {phone && picked ? null : (
          // zIndex, because react-native-web gives every View `position:
          // relative; z-index: 0`, which makes each one a stacking context the
          // menu's own z-index cannot escape. Without it the panel opens
          // underneath the map it is drawn over. Same trap NavBar documents.
          <View style={{ position: "absolute", left: 12, bottom: 12, zIndex: 30 }}>
              <BasemapMenu
              value={basemap}
              onChange={setBasemap}
              radar={radar}
              onRadarChange={setRadar}
              opacity={radarOpacity}
              onOpacityChange={setRadarOpacity}
              theme={theme}
            />
          </View>
        )}

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
            onStep={step}
            minutes={frame * 5}
            onToggle={() => {
              // Pressing play while parked at the horizon rewinds, so the
              // button does the obvious thing after a manual scrub to the end.
              // A caught-up STREAM does not rewind — there is nothing behind
              // the reader to see, and the next frame is about to arrive.
              if (!playing && !partial && playhead >= frameCount - 1) setPlayhead(0);
              setPlaying((p) => !p);
            }}
          />
          <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10 }}>
            {!radar
              ? // SAYS SO WHEN THE LAYER IS OFF, and this line is the whole
                // reason "off" is allowed to exist. A map with no overlay looks
                // exactly like a map with no rain on it; without a sentence
                // here the app would be showing a confident, legible, wrong
                // answer — the one thing it is built not to do.
                t("map.radarOff")
              : loading
              ? t("map.loadingField")
              : partial
                ? // Says the animation is still arriving rather than showing a
                  // frame count that is about to change under the reader.
                  t("map.loadingFrames")
                : t("map.sampling", { km: 1, frames: frameCount })}
          </Text>
        </View>

        {/*
          The graph only when there is a point to graph. Bar height is the share
          of the saved disc under rain, which needs a disc — with no place the
          strip would have no subject, and inventing one ("share of the visible
          map") is a different quantity that should not wear the same shape
          without saying so.

          It is the verdict's own small fetch, not a second radar path: the
          51x51 float window this screen used to pull is gone.
        */}
        {place && verdict ? (
          <PrecipitationGraph
            frames={verdict.frames}
            theme={theme}
            density="expanded"
            selectedIndex={frame}
            onScrub={(i) => {
              setPlaying(false);
              setPlayhead(i);
            }}
          />
        ) : null}

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

/**
 * The saved place, drawn on the map: a ring for the disc and a dot for the
 * coordinate.
 *
 * The ring is sized from the PROJECTION rather than from a constant, so it
 * stays the right number of kilometres through a zoom — the same maths the
 * add-a-place picker uses, and the same band-palette colour, so a circle means
 * the same thing on both screens.
 */
function PlaceMark({
  place,
  zoom,
}: {
  place: { lat: number; lon: number; radiusKm: number; name: string };
  zoom: number;
}) {
  const px = (2 * place.radiusKm * 1000) / metersPerPixel(place.lat, zoom);
  const ringPx = Number.isFinite(px) ? px : 0;
  return (
    <>
      <View
        testID="place-ring"
        aria-hidden
        className="border-b4"
        style={{
          position: "absolute",
          width: ringPx,
          height: ringPx,
          borderRadius: ringPx / 2,
          borderWidth: 1.5,
        }}
      />
      <View
        accessibilityLabel={place.name}
        style={{
          width: 11,
          height: 11,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: "rgba(21,24,27,.75)",
          backgroundColor: "rgba(255,255,255,.9)",
        }}
      />
    </>
  );
}
