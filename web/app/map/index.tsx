import { MapScreen } from "../../screens/MapScreen";

/**
 * `/map` — the radar with no place in mind.
 *
 * The parent of `/map/<id>`, which is the same radar anchored on a place you
 * saved. One namespace for one surface: `/map` is where the radar lives, and the
 * id says whose question it is being asked about.
 *
 * It is deliberately not the app's index. byge answers a question about
 * somewhere you chose; a map is what you look at when you have not chosen.
 */
export default MapScreen;
