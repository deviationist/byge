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
  // Genuinely useful in a country where a great many saved places are coastal.
  nautical: "sjokartraster",
} as const;

export type KartverketLayer = keyof typeof KARTVERKET_LAYERS;

const TILE = 256;

export function tileUrl(layer: KartverketLayer, z: number, x: number, y: number): string {
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

  for (let ty = firstY; ty <= lastY; ty++) {
    // Y is NOT wrapped: above the pole or below it there is no tile, and asking
    // for one returns an error image rather than empty space.
    if (ty < 0 || ty >= span) continue;
    for (let tx = firstX; tx <= lastX; tx++) {
      // X wraps, so dragging across the antimeridian keeps showing map rather
      // than running off the edge of the world.
      const wrapped = ((tx % span) + span) % span;
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        url: tileUrl(layer, z, wrapped, ty),
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
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
