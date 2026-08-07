import { Image, View } from "react-native";

/**
 * Raster basemap tiles from Kartverket, positioned under the map overlays.
 *
 * WHY NOT MAPLIBRE. MapCanvas already does the hard part — Web Mercator
 * projection, panning, centre recomputation — and it deliberately uses the
 * WGS84 equatorial radius so its pixels mean what a tile server's pixels mean.
 * What remained was working out which tiles cover the viewport and placing
 * them, which is this file. MapLibre is ~200 KB gzipped and buys vector
 * styling, rotation, tilt and 3D; byge uses none of them, and its stated bar is
 * an answer in under a second. A radar overlay in phase 2 is another raster
 * layer, so it does not change the calculus either.
 *
 * WHY KARTVERKET. It is the Norwegian mapping authority, the source the app
 * already credits, free, and needs no API key — so nothing about the basemap
 * has to be smuggled into the client bundle. Tiles carry
 * `access-control-allow-origin: *` and a five-day cache header.
 *
 * PRIVACY NOTE, stated rather than buried: tiles come from a third origin, so
 * panning the picker tells Kartverket roughly where you are looking. That is a
 * real dent in "everything stays on this device" — smaller than it sounds,
 * since MET already learns the same thing from the verdict itself, but it is
 * not nothing. It is also why there is no analytics or telemetry alongside it.
 */

/** Layers available without an agreement. Verified live, not from docs. */
export const KARTVERKET_LAYERS = {
  // Greyscale topographic. The picker's default: the design wants the basemap
  // quiet so the radius ring and crosshair carry, and a full-colour map fights
  // the precipitation palette for attention.
  grey: "topograatone",
  topo: "topo",
  // The scanned 1:50 000-style sheet. Denser contours and real relief where
  // `topo` goes flat — in a city the two are near-identical, but out in terrain
  // this is the one that shows you the valley your cabin sits in.
  detailed: "toporaster",
  // Genuinely useful in a country where a great many saved places are coastal.
  nautical: "sjokartraster",
} as const;

/**
 * The one layer that covers the whole radar footprint.
 *
 * WHY IT HAD TO EXIST. MET's mosaic reaches Denmark, Sweden, Finland, Germany,
 * the Baltics and St Petersburg. Kartverket stops at the Norwegian border, and
 * it does not stop by failing — it serves an identical 854-byte BLANK tile for
 * every request outside Norway, verified across nine cities. So the map drew
 * live rain over white nothing for most of its own coverage, and blank ground
 * is itself a claim: it reads as "the data ended" exactly where the data is
 * fine. That is the same species of confident wrong answer as painting
 * unobserved cells as dry.
 *
 * CARTO POSITRON, for the reason the design gives for preferring muted: "a
 * basemap under a data overlay should lose every argument with the data". It is
 * greyscale, it is global, it needs no key, and it is OpenStreetMap underneath
 * — so the coastlines agree with everyone else's.
 *
 * ITS OWN ATTRIBUTION, and that is not optional. ODbL requires the OSM credit
 * to travel with the data and CARTO requires theirs, so the credit is a
 * function of the layer rather than a constant on the map — see `creditFor`.
 *
 * NOT A SILENT SUBSTITUTION for the Kartverket layers, per the design's ruling:
 * "it belongs in the switcher as a fifth option, since the two do not agree on
 * detail". Kartverket is better over Norway and this is the only thing that
 * works anywhere else.
 */
const BASE_URL = "https://basemaps.cartocdn.com/light_all";

/**
 * No aerial or satellite layer, and not for want of trying. Kartverket's open
 * WMTS cache advertises exactly four layers, all of them maps; Norge i bilder
 * (the national orthophoto) sits behind a signed agreement, the old
 * `opencache.statkart.no` gateway no longer resolves, and the WebAtlas tiles
 * answer 403 without a key. So "satellite" and "hybrid" are not features that
 * were skipped — they are not available to an app with no vendor account.
 */

/**
 * Every basemap the app offers. Four from Kartverket, one global.
 *
 * The name is now a lie of history — `KartverketLayer` covers one layer that is
 * not Kartverket's — but renaming it touches thirty call sites for no gain, and
 * the type is about "which basemap", not about who serves it.
 */
/**
 * The DETAIL sheet, or none.
 *
 * The base map is not in this union, and that is the point. It is not one
 * option among five — it is always drawn, it is global, and naming it in a list
 * of Norwegian sheets invited exactly the confusion it caused: it was called
 * "Nordic", which is a name for something that covers the world. A layer the
 * reader cannot turn off and cannot choose does not belong in the chooser.
 *
 * So what a caller picks is which sheet goes ON TOP, and `"none"` is a real
 * answer — the base alone is a perfectly good map, just a plainer one.
 */
export type KartverketLayer = keyof typeof KARTVERKET_LAYERS | "none";

/**
 * Who to credit for a layer's tiles.
 *
 * A licence condition, and it varies: the Kartverket layers are Kartverket's,
 * and the global one is OpenStreetMap's data rendered by CARTO. A single
 * hardcoded credit line was correct only while there was a single provider.
 */
export function creditFor(layer: KartverketLayer): string {
  // The base always served tiles, so its credit is never absent. Kartverket's
  // is added only when one of their sheets is actually drawn.
  return layer === "none" ? BASE_CREDIT : `© Kartverket · ${BASE_CREDIT}`;
}

const BASE_CREDIT = "© OpenStreetMap contributors · © CARTO";

/**
 * Which layers stack, and in what order.
 *
 * THE GLOBAL LAYER IS ALWAYS UNDERNEATH. Kartverket's tiles are RGBA and
 * FULLY TRANSPARENT outside Norway — verified pixel by pixel across all four
 * layers: 0 % opaque over Hamburg, 55-66 % over Oslo, the remainder being sea
 * and inland water, which is also transparent. So they are not a basemap at
 * all; they are an overlay that happens to have had nothing beneath it.
 *
 * That is the whole design here. A basic map that covers the radar goes down
 * first, and the high-fidelity Norwegian sheets go on top of it. Outside Norway
 * the top layer contributes nothing and the base shows through; inside, you get
 * Kartverket's detail with the base filling its water. Nothing has to detect a
 * border, because the tiles already encode where they apply.
 */
function stackFor(layer: KartverketLayer): (keyof typeof KARTVERKET_LAYERS | "base")[] {
  return layer === "none" ? ["base"] : ["base", layer];
}

const TILE = 256;

export function tileUrl(
  layer: keyof typeof KARTVERKET_LAYERS | "base",
  z: number,
  x: number,
  y: number,
): string {
  if (layer === "base") return `${BASE_URL}/${z}/${x}/${y}.png`;
  // Kartverket's WMTS puts ROW before COLUMN, which is the opposite order to
  // the XYZ convention every other provider uses. Getting it backwards returns
  // a valid tile from the wrong place, which is the worst kind of wrong.
  return `https://cache.kartverket.no/v1/wmts/1.0.0/${KARTVERKET_LAYERS[layer]}/default/webmercator/${z}/${y}/${x}.png`;
}

export type TileLayerProps = {
  /**
   * Top-left of the viewport in absolute Mercator world pixels, and the integer
   * zoom those pixels belong to.
   *
   * Passed in rather than derived from a centre, so this file never imports
   * MapCanvas's projection — that would be a cycle, and duplicating the
   * projection here is exactly what MapCanvas warns against. One owner of what
   * a pixel is worth.
   */
  originX: number;
  originY: number;
  z: number;
  width: number;
  height: number;
  layer: KartverketLayer;
};

export function TileLayer({ originX, originY, z, width, height, layer }: TileLayerProps) {
  const firstX = Math.floor(originX / TILE);
  const firstY = Math.floor(originY / TILE);
  const lastX = Math.floor((originX + width) / TILE);
  const lastY = Math.floor((originY + height) / TILE);

  const span = 2 ** z;
  const tiles: { key: string; url: string; left: number; top: number }[] = [];

  // Base first, detail second — array order IS paint order, and the detail
  // sheet is transparent wherever it does not apply.
  for (const which of stackFor(layer)) {
    for (let ty = firstY; ty <= lastY; ty++) {
      // Y is NOT wrapped: above the pole or below it there is no tile, and
      // asking for one returns an error image rather than empty space.
      if (ty < 0 || ty >= span) continue;
      for (let tx = firstX; tx <= lastX; tx++) {
        // X wraps, so dragging across the antimeridian keeps showing map rather
        // than running off the edge of the world.
        const wrapped = ((tx % span) + span) % span;
        tiles.push({
          key: `${which}/${z}/${tx}/${ty}`,
          url: tileUrl(which, z, wrapped, ty),
          left: tx * TILE - originX,
          top: ty * TILE - originY,
        });
      }
    }
  }

  return (
    <View
      testID="tile-layer"
      // Out of the way of the surface's drag listener, exactly like the
      // graticule it replaces.
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    >
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.url }}
          // `contain` would letterbox a tile that is not exactly 256; these are,
          // and stretching is the correct behaviour for the one that is not.
          resizeMode="cover"
          style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }}
        />
      ))}
    </View>
  );
}
