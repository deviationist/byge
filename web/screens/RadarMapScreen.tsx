import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { ErrorScreen } from "../components/ErrorScreen";
import { LocationCard } from "../components/LocationCard";
import { MapCanvas } from "../components/MapCanvas";
import { MapLegend } from "../components/MapLegend";
import { NavBar } from "../components/NavBar";
import { PlaybackControl } from "../components/PlaybackControl";
import { PrecipitationGraph } from "../components/PrecipitationGraph";
import { RadarLayer } from "../components/RadarLayer";
import { BASEMAP_OPTIONS, SegmentedControl } from "../components/SegmentedControl";
import type { KartverketLayer } from "../components/TileLayer";
import { useBack } from "../hooks/useBack";
import { useLocations } from "../hooks/useLocations";
import { useRadarGrid } from "../hooks/useRadarGrid";
import { useVerdict } from "../hooks/useVerdict";
import { Screen } from "../layouts/Screen";
import type { Verdict } from "../lib/forecast";
import { NOTICEABLE } from "../lib/scale";
import { useResolvedTheme } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";

/**
 * "See why" — the radar field behind the sentence.
 *
 * A CONFIRMATION LAYER, and the design is emphatic that it is only that: never
 * the landing view, never a default tab, never the largest thing on the verdict
 * screen. You arrive here from a text link, and the answer you came for is
 * still the sentence you left. The map exists because "Rain in about 40 min" is
 * a claim, and some people want to see the claim's evidence before they trust
 * it — not because a weather app ought to open on a map.
 *
 * It mounts the SAME MapCanvas as the add-a-place picker and the SAME graph as
 * the verdict screen. Not similar ones: the same components, so the band you
 * scrub to here cannot disagree with the bar you read there.
 *
 * THE GRAPH IS THE SCRUBBER, which is the design's best idea on this screen.
 * There is no separate timeline widget: the thing that already shows the shape
 * of the next two hours is the thing you drag to move through them, so the
 * control and its own legend are one object.
 */
/**
 * Is the spell still running when the frames stop?
 *
 * The horizon note is about the DATA ending, not the weather — so it only
 * belongs when something is still falling at the last frame. Over a clear field
 * it would invent an open end nobody claimed, which is the exact species of
 * over-statement the rest of this app is built to avoid.
 */
function isOpenEndedAtHorizon(v: Verdict): boolean {
  const last = v.frames.at(-1);
  return !!last && last.maxRate >= NOTICEABLE;
}

export function RadarMapScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const goBack = useBack("/");
  const { width } = useWindowDimensions();
  const { byId } = useLocations();

  const location = byId(id);
  const { data: verdict } = useVerdict(location);
  const { data: probe, isError } = useRadarGrid(location);

  const [basemap, setBasemap] = useState<KartverketLayer>("grey");
  // Frame index, not minutes. The graph speaks in indices and so does the
  // grid, and converting between them in two places is how they drift apart.
  const [frame, setFrame] = useState(0);
  // Measured so the legend can decide its own density — see MapLegend.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [playing, setPlaying] = useState(false);

  const frameCount = verdict?.frames.length ?? 0;

  // Advance while playing, and stop at the horizon rather than looping.
  //
  // A loop is what every radar map does, and it is wrong here: it turns a
  // two-hour forecast into wallpaper, and it quietly hides the moment that
  // matters most — the END, where the data runs out and byge starts saying "no
  // end in sight". Playing to the horizon and stopping puts the reader at that
  // edge and leaves them there.
  useEffect(() => {
    if (!playing || frameCount === 0) return;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(
      () => {
        setFrame((f) => {
          if (f >= frameCount - 1) {
            setPlaying(false);
            return f;
          }
          return f + 1;
        });
      },
      // Slow enough to follow for anyone who asked for less motion. The control
      // stays either way: stepping through frames is how this screen is read,
      // so removing it would remove the screen's point rather than its motion.
      reduced ? 900 : 220,
    );
    return () => clearInterval(id);
  }, [playing, frameCount]);

  // A deep link to a place that has since been removed — the one dead end whose
  // cause we actually know, so it is the one that names it. It does not offer to
  // restore: byge keeps places locally and holds no copy, so restoring would
  // mean inventing a coordinate.
  if (!location) {
    return (
      <ErrorScreen
        kind="deleted"
        path={id ? `/location/${id}/map` : undefined}
        onPrimary={() => router.replace("/")}
        onSecondary={() => router.replace("/add")}
      />
    );
  }

  const frames = verdict?.frames ?? [];
  const phone = width < 720;

  return (
    // No measure cap and no page padding: this is a field to look at, not a
    // line to read, and it is the one screen in byge that legitimately wants
    // the whole viewport.
    <Screen measure={null} pad={{ top: 0, horizontal: 0, bottom: 0 }}>
      <View style={{ paddingHorizontal: phone ? 14 : 20, paddingTop: 14 }}>
        <NavBar onBack={goBack} backLabel={t("nav.backToVerdict")}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-ink" style={{ fontSize: 13, fontWeight: "500" }}>
              {location.name}
            </Text>
            {/*
              Says what the screen IS, in the register byge uses for
              instrumentation. Without it a map this size reads as the main
              event, and the design's whole position is that it is not.
            */}
            <Text
              className="text-ink3"
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.3, marginTop: 2 }}
            >
              {t("radarMap.subtitle")}
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
          center={{ lat: location.lat, lon: location.lon }}
          zoom={9}
          basemap={basemap}
          theme={theme}
          label={t("radarMap.label", { name: location.name })}
          attribution={t("radarMap.attribution")}
          overlay={(v) =>
            probe?.grid ? (
              <RadarLayer
                grid={probe.grid}
                frame={frame}
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
          {/*
            The same card as the list row, so the place cannot describe itself
            one way in the list and another on the map. Popup variant, pinned
            above the coordinate rather than on it.
          */}
          {verdict ? (
            <View style={{ position: "absolute", transform: [{ translateY: -70 }] }}>
              <LocationCard
                name={location.name}
                place={location.place}
                lat={location.lat}
                lon={location.lon}
                verdict={verdict}
                theme={theme}
                variant="popup"
              />
            </View>
          ) : null}
        </MapCanvas>

        {/*
          On its own surface, because the control floats over a basemap that is
          busy by design. Unbacked, the unselected segments were transparent
          over topography and effectively unreadable — the design wraps it in a
          card for exactly this reason.
        */}
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
      </View>

      <View
        className="bg-surface border-t-line"
        style={{
          borderTopWidth: 1,
          paddingHorizontal: phone ? 14 : 20,
          paddingTop: 16,
          paddingBottom: 20,
          gap: 12,
        }}
      >
        {isError && !probe ? (
          <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10 }}>
            {t("radarMap.unavailable")}
          </Text>
        ) : null}

        {frames.length > 0 ? (
          <>
            <PlaybackControl
              playing={playing}
              index={frame}
              count={frameCount}
              minutes={frames[frame]?.minutes ?? 0}
              // Only when the spell under the reader is still running at the
              // last frame. Saying it over a clear field would invent an open
              // end nobody claimed.
              openEnded={verdict ? isOpenEndedAtHorizon(verdict) : false}
              onToggle={() => {
                if (!playing && frame >= frameCount - 1) setFrame(0);
                setPlaying((p) => !p);
              }}
            />
            <PrecipitationGraph
              frames={frames}
              theme={theme}
              density="expanded"
              selectedIndex={frame}
              // Touching the scrubber stops playback. Fighting an animation for
              // control of the thing you are dragging is the worst version of
              // both, and the reader has just said which frame they want.
              onScrub={(i) => {
                setPlaying(false);
                setFrame(i);
              }}
            />
          </>
        ) : null}

        <Text
          className="text-ink3"
          style={{ fontFamily: MONO, fontSize: 10, lineHeight: 17, maxWidth: "70ch" as never }}
        >
          {theme === "dark" ? `${t("radarMap.darkNote")} ` : ""}
          {t("radarMap.window")} {t("radarMap.footnote")}
        </Text>
      </View>
    </Screen>
  );
}
