import { RadarMapScreen } from "../../screens/RadarMapScreen";

/**
 * `/map/<id>` — the radar, anchored on a place you saved.
 *
 * A SIBLING OF `/map`, not a child of the verdict. It used to live at
 * `/location/<id>/map`, on the reasoning that the map is about a place's verdict
 * rather than a destination of its own — and that URL argued the point by having
 * nowhere else to be. Then `/map` was built, and the argument stopped being
 * true: there are now two views of one surface, and burying one of them under a
 * different branch made the app look like it had two unrelated maps.
 *
 * So the namespace follows the thing rather than the route you happened to
 * arrive by: `/map` is the radar, `/map/<id>` is the radar with a place in it.
 * The id is the only difference, and it is the only difference on screen too.
 */
export default RadarMapScreen;
