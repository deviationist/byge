import { Text, View } from "react-native";
import { MONO } from "../theme/tokens";
import { type LatLon, metersPerPixel } from "./MapCanvas";

/**
 * The map's own numbers, for whoever is working on the map.
 *
 * OFF UNLESS ASKED FOR, via `?debug` in the URL. Not `__DEV__`, and the
 * difference matters: the questions this answers — why is this view coarse,
 * why did that pan cost a request — are asked on a phone, on the deployed
 * build, on a real connection, which is exactly where a dev-only overlay is
 * absent. A query parameter is reachable from anywhere and is gone the moment
 * the URL is.
 *
 * IT IS NOT A FEATURE, so it gets none of the design's care: no i18n (nobody
 * translates a debug readout), no theme-aware palette beyond staying legible,
 * no responsive behaviour. If it ever needs those, it has stopped being this.
 *
 * IT MUST NOT EAT THE MAP. `pointerEvents: none` throughout — a panel pinned
 * over the canvas that swallowed a drag would break the very gesture whose
 * numbers it is reporting.
 */
export type MapDebugProps = {
  center: LatLon;
  zoom: number;
  /** Cells per texel is `1 << level`; 0 is the native 1 km grid. */
  level: number;
  /** Tiles the current view is asking for. */
  tiles: number;
  /** Frames every visible tile actually holds, and how many are wanted. */
  depth: number;
  expected: number;
  /** Pane size in CSS px, which is what decides the tile count. */
  width: number;
  height: number;
};

/** Whether the URL asked for it. Web-only by construction; false anywhere else. */
export function debugRequested(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const q = new URLSearchParams(window.location.search);
  // `?debug` with no value counts — `has` rather than a truthy `get`.
  return q.has("debug") && q.get("debug") !== "0";
}

export function MapDebug({
  center,
  zoom,
  level,
  tiles,
  depth,
  expected,
  width,
  height,
}: MapDebugProps) {
  // MapCanvas's own, not a second copy: a debug readout that computed the scale
  // differently from the map would be worse than no readout at all.
  const mpp = metersPerPixel(center.lat, zoom);
  const rows: [string, string][] = [
    ["zoom", String(zoom)],
    // Six decimals is ~10 cm — enough to paste into another map and land on
    // the same spot, which is the main thing this line is for.
    ["centre", `${center.lat.toFixed(6)}, ${center.lon.toFixed(6)}`],
    ["m/px", mpp < 10 ? mpp.toFixed(1) : String(Math.round(mpp))],
    // The pyramid, stated in the units of the question people actually ask:
    // not "level 2" but "each square you see is 4 km of ground".
    ["radar", `level ${level} · ${1 << level} km/texel`],
    ["tiles", `${tiles} @ ${128 << level} km`],
    ["frames", `${depth}/${expected}`],
    ["pane", `${Math.round(width)} x ${Math.round(height)}`],
  ];

  return (
    <View
      testID="map-debug"
      pointerEvents="none"
      // Its own stacking context sits above the canvas but below the menus,
      // which are the things a person can actually click.
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        zIndex: 20,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 4,
        // Fixed dark-on-light rather than themed: this sits over a basemap, not
        // over the app's paper, and the basemap is light in both themes.
        backgroundColor: "rgba(20, 20, 20, 0.78)",
        gap: 1,
      }}
    >
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", gap: 6 }}>
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 14,
              color: "rgba(255,255,255,0.55)",
              width: 44,
            }}
          >
            {k}
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 10, lineHeight: 14, color: "#fff" }}>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}
