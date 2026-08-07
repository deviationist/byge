import { getItem, setItem } from "./kv";

/**
 * Where the radar map was last looking.
 *
 * WHY THIS IS ALLOWED, given the design is emphatic that the map must not become
 * the front door. The ruling is about ROUTES: "the launcher always opens the
 * list… the app must not remember the map as where I was", and that still
 * holds — nothing here restores a route. This remembers what the map was
 * showing WHEN you go to it, which is a different thing and the opposite of a
 * shortcut: it saves you re-finding the same coastline every time.
 *
 * ONLY FOR THE UNANCHORED MAP. `/map/<id>` opens on its place, because the place
 * is the entire reason that route exists — restoring a saved viewport there
 * would answer a question about somewhere else.
 *
 * IT IS A VIEW, NOT A PLACE. A saved place is a claim about what matters to
 * someone and lives with the rest of their data; this is scroll position. It is
 * stored under its own key so clearing places never has to reason about it, and
 * a corrupt or absent value simply falls back to the default view rather than
 * being repaired.
 */

const KEY = "byge.map.view";

/**
 * Everything about how someone has set the map up.
 *
 * ONE KEY, because these are one decision. Where you are looking, what is under
 * the radar, and whether the radar is drawn at all are all "how I have this map
 * set up" — splitting them across keys would mean a half-restored map after a
 * partial write, which is worse than none.
 *
 * PRECIPITATION IS A LAYER, like the basemap and the sheets over it. That is
 * what makes "off" an explicit, legible state rather than an opacity of zero —
 * which would be indistinguishable on screen from a clear sky, and is exactly
 * the confident wrong answer this app exists not to give. The screen says so
 * while it is off; see MapScreen.
 */
export type MapView = {
  lat: number;
  lon: number;
  zoom: number;
  /** Which map is drawn under the radar. */
  basemap: string;
  /** Whether the radar is drawn at all. */
  radar: boolean;
  /** How opaque it is when it is. 0..1. */
  radarOpacity: number;
};

/**
 * Rounded to four decimals, the same precision the app clamps coordinates to
 * everywhere else — about 11 m, far finer than a 1 km radar cell and coarse
 * enough that this is not a precise record of anywhere.
 */
export function saveMapView(v: MapView): void {
  setItem(
    KEY,
    JSON.stringify({
      lat: Number(v.lat.toFixed(4)),
      lon: Number(v.lon.toFixed(4)),
      zoom: Math.round(v.zoom),
      basemap: v.basemap,
      radar: v.radar,
      radarOpacity: Number(v.radarOpacity.toFixed(2)),
    }),
  );
}

/**
 * The saved view, or null.
 *
 * VALIDATED RATHER THAN TRUSTED. This is the one value in the app that comes
 * back from storage and is fed straight into the projection, and the projection
 * throws outside its domain — so a hand-edited key, a half-written value or a
 * format from a future version would break the map on load rather than
 * degrading. Anything that is not a plausible coordinate at a real zoom is
 * treated as absent.
 */
export function loadMapView(
  min: number,
  max: number,
  /** Layer names this build knows. One saved by an older or newer build is dropped. */
  basemaps: readonly string[],
  fallback: Omit<MapView, "lat" | "lon" | "zoom">,
): MapView | null {
  const raw = getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MapView>;
    if (
      typeof v.lat !== "number" ||
      typeof v.lon !== "number" ||
      typeof v.zoom !== "number" ||
      !Number.isFinite(v.lat) ||
      !Number.isFinite(v.lon) ||
      !Number.isFinite(v.zoom) ||
      v.lat < -90 ||
      v.lat > 90 ||
      v.lon < -180 ||
      v.lon > 180
    ) {
      return null;
    }
    return {
      lat: v.lat,
      lon: v.lon,
      zoom: Math.min(max, Math.max(min, Math.round(v.zoom))),
      // Each layer field falls back on its own, because a view whose BASEMAP is
      // unrecognised is still a perfectly good position — dropping the whole
      // thing over one stale field would throw away the part that matters most.
      basemap:
        typeof v.basemap === "string" && basemaps.includes(v.basemap)
          ? v.basemap
          : fallback.basemap,
      radar: typeof v.radar === "boolean" ? v.radar : fallback.radar,
      radarOpacity:
        typeof v.radarOpacity === "number" &&
        Number.isFinite(v.radarOpacity) &&
        v.radarOpacity >= 0 &&
        v.radarOpacity <= 1
          ? v.radarOpacity
          : fallback.radarOpacity,
    };
  } catch {
    return null;
  }
}
