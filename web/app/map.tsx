import { MapScreen } from "../screens/MapScreen";

/**
 * `/map` — the radar with no place in mind.
 *
 * Top level, unlike `/location/<id>/map`, because it is about nothing in
 * particular. That is also the reason it is not the app's index: byge answers a
 * question about somewhere you chose, and a map is what you look at when you
 * have not chosen.
 */
export default MapScreen;
