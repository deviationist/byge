import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useRadarTiles } from "../hooks/useRadarTiles";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import { MapCanvas, metersPerPixel } from "./MapCanvas";
import { RadarTilesGL } from "./RadarTilesGL";

/**
 * The radar behind the sentence, small enough to stay behind it.
 *
 * WHY IT IS A PICTURE NOW AND WAS A LINE OF TEXT BEFORE. The design's position
 * on the map has not changed and this does not overturn it: the map is a
 * confirmation layer, the answer is still the sentence above, and this sits
 * where the text link sat — at the foot, after the graph, below everything that
 * actually answers the question. What changes is that "see why" used to ask you
 * to take the trip on faith. A reader who wants evidence should be able to see
 * whether there is any weather nearby before deciding to go and look at it, and
 * a 150-pixel strip at the bottom of the page cannot compete with a 54-point
 * headline for attention. If it ever starts to, it is too big.
 *
 * ONE FRAME, NOT TWENTY-FOUR. It asks for a single still — a few tiles, a couple
 * of kilobytes gzipped. The map screen fetches the whole run because it plays
 * it; a picture that says "here is now" needs exactly one frame, and paying for
 * an animation nobody can see on every verdict view would be the version of
 * this that deserves the design's original objection.
 *
 * IT SHARES THE MAP'S CACHE, which is the quiet benefit of tiles: the squares
 * this downloads are the squares the full map wants, so tapping through finds
 * frame 0 already in memory and paints instantly.
 *
 * THE SAME RENDERER AS THE FULL SCREEN, deliberately — the same MapCanvas and
 * the same tiled GL layer, not a simplified stand-in, so the field you tap
 * cannot disagree with the field you arrive at. A preview that paints its bands
 * by a second set of rules is a preview of something else.
 *
 * NOT INTERACTIVE. `MapCanvas` gets `interactive={false}`, which is what makes
 * the whole surface a link instead of a map that also happens to be one:
 * nothing here pans, nothing zooms, and a drag does not fight the page scroll.
 */
export type RadarPreviewProps = {
  lat: number;
  lon: number;
  /** The place's name, for the accessible label — a bare map has none. */
  name: string;
  /** The disc the verdict is actually about, drawn as a ring. */
  radiusKm: number;
  theme: Theme;
  onPress: () => void;
  /** Shorter on a phone, where vertical space is the scarce thing. */
  height?: number;
};

/**
 * Close enough to read a band, wide enough to see it coming.
 *
 * Zoom 9 is about 150 m per pixel at Norwegian latitudes, so a preview this
 * size covers roughly 50 km across — the same order as the anchored map's own
 * window, which is what stops the tap feeling like a jump to somewhere else.
 */
const PREVIEW_ZOOM = 9;

/**
 * The radius ring's diameter on screen, in CSS pixels.
 *
 * Exported so it can be checked without a canvas. react-native-web compiles
 * every style into an atomic class, so nothing about a rendered size is legible
 * from the DOM in jsdom — the only way to assert the ring tracks the saved
 * radius rather than being a fixed decoration is to test the arithmetic that
 * produces it.
 */
export function ringDiameterPx(radiusKm: number, lat: number): number {
  return (2 * radiusKm * 1000) / metersPerPixel(lat, PREVIEW_ZOOM);
}

export function RadarPreview({
  lat,
  lon,
  name,
  radiusKm,
  theme,
  onPress,
  height = 168,
}: RadarPreviewProps) {
  const { t } = useTranslation();
  // The window cannot be planned before layout: it is derived from how many
  // pixels are actually on screen, and a flex box does not know that until it
  // has been measured.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const { tiles, depth, version } = useRadarTiles(
    size ? { lat, lon, zoom: PREVIEW_ZOOM, width: size.width, height: size.height } : null,
    1,
  );

  // Drawn in real-world units, so it asks the projection how big a pixel is
  // rather than assuming a scale. At 3 km and zoom 9 that is about 40 px across.
  const ringPx = ringDiameterPx(radiusKm, lat);

  return (
    <Pressable
      testID="radar-preview"
      accessibilityRole="link"
      // Names the destination, not the picture. "Radar map of Home" would
      // describe what is under the finger; this describes what pressing does,
      // which is the only thing a link can promise.
      accessibilityLabel={t("radarMap.seeWhyFor", { name })}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, gap: 8 })}
    >
      {/* MapCanvas draws its own rounded, clipped frame — this box only fixes the
          height, and passes it down so the surface does not overflow it. */}
      <View
        style={{ height }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((p) => (p && p.width === width && p.height === height ? p : { width, height }));
        }}
      >
        <MapCanvas
          center={{ lat, lon }}
          zoom={PREVIEW_ZOOM}
          basemap="grey"
          theme={theme}
          interactive={false}
          minHeight={height}
          // Hidden from the accessibility tree in favour of the link's own
          // label: a region called "Radar around Home" nested inside a link
          // called "See why — radar map for Home" is one object announced twice.
          label={undefined}
          // A licence condition, not chrome. These are Kartverket's tiles, and
          // the app's own footer credits MET and OSM but not them — the basemap
          // credit travels with the basemap, so a surface that shows tiles has
          // to carry it however small the surface is.
          attribution={t("radarMap.attribution")}
          overlay={(v) =>
            depth > 0 ? (
              <RadarTilesGL
                tiles={tiles}
                version={version}
                frame={0}
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
            The DISC the verdict is about, not just the coordinate.

            The same ring the add-a-place picker draws, in the same palette
            colour, for the same reason: the sentence above is a claim about
            everything inside this circle, and without it a reader would match
            the headline against the single point under the marker. That is the
            misreading the radius setting exists to prevent — "rain on the way"
            can mean a band 3 km off, and this is where you can see that.
          */}
          <View
            testID="radius-ring"
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
            aria-hidden
            style={{
              width: 11,
              height: 11,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: "rgba(21,24,27,.75)",
              backgroundColor: "rgba(255,255,255,.9)",
            }}
          />
        </MapCanvas>
      </View>

      {/*
        The link text stays. Without it the strip is a decorative image that
        happens to navigate, and nothing on screen says where. It also keeps the
        screen readable when the field has not loaded, or cannot.
      */}
      <Text className="text-ink2" style={{ fontSize: 12.5 }}>
        {t("radarMap.seeWhy")} <Text style={{ fontFamily: MONO }}>→</Text>
      </Text>
    </Pressable>
  );
}
