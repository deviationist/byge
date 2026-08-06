import { RadarMapScreen } from "../../../screens/RadarMapScreen";

/**
 * `/location/<id>/map` — nested under the verdict on purpose.
 *
 * The map is ABOUT a place's verdict; it is not a destination of its own. The
 * URL says so: there is no `/map` route, and no way to reach one without having
 * chosen a place first. It also gives the back control something true to fall
 * back to when someone opens this cold.
 */
export default RadarMapScreen;
