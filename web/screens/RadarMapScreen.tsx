import { useLocalSearchParams } from "expo-router";
import { MapScreen } from "./MapScreen";

/**
 * `/map/<id>` — the radar, with a place marked on it.
 *
 * IT IS THE SAME SCREEN AS `/map`, and that is the whole of this file. It used
 * to be a second implementation: `useRadarGrid` pulled a 51x51 window of raw
 * floats, `RadarLayer` painted it on a 2D canvas at a fixed zoom 9, and there
 * was no panning, no zoom control, no cell picking and an integer playhead. So
 * the anchored map — the one reached from a verdict, the one most people would
 * actually open — was the worse of the two on every axis, and every improvement
 * to the tiled map skipped it.
 *
 * The route stays, because it means something: this is the map with a place in
 * it, arrived at from that place's answer. The id now adds a marker, a radius
 * ring and the precipitation strip, and nothing else. The radar underneath is
 * the same tiled field, at any zoom, pannable — which is what makes "will that
 * band reach my cabin" a question you can actually look at.
 */
export function RadarMapScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <MapScreen placeId={id} />;
}
