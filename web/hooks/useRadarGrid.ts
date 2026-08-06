import { useQuery } from "@tanstack/react-query";
import { probe } from "../lib/radar";
import type { SavedLocation } from "../lib/storage";

/**
 * The radar field around a place, for the map.
 *
 * A SEPARATE FETCH FROM THE VERDICT, deliberately. The verdict asks for the
 * saved radius — often 3 km, a 7×7 window — because that is the question it
 * answers. A map of a 7×7 window would be a postage stamp in the middle of the
 * screen. So this asks for the widest window the proxy will serve and keeps the
 * cells, while the verdict keeps asking its own smaller question. Two questions,
 * two answers; collapsing them would make every list row pay for a screen
 * almost nobody opens.
 *
 * WIDTH IS CAPPED BY THE PROXY, not chosen here: `limits.MaxRadiusKm` is 25, so
 * 51×51 is the largest span it will forward. That is not an arbitrary ceiling —
 * 24 frames of 51×51 is about 350 KB, which is the number the radius field
 * warns about, and it is the honest cost of this screen.
 */
const MAP_RADIUS_KM = 25;

/** Five minutes, matching the verdict — the analysis behind them is the same. */
const FIVE_MIN = 5 * 60 * 1000;

export function useRadarGrid(location: SavedLocation | undefined) {
  return useQuery({
    queryKey: ["radar-grid", location?.lat, location?.lon],
    enabled: !!location,
    queryFn: async ({ signal }) => {
      if (!location) return null;
      return probe(location.lat, location.lon, {
        radiusKm: MAP_RADIUS_KM,
        keepGrid: true,
        signal,
      });
    },
    staleTime: FIVE_MIN,
    // NOT polled. The verdict screen refreshes on a timer because it answers a
    // question that goes stale; this is a picture you came to look at, and
    // having the band jump under a scrub you are in the middle of would be
    // worse than showing an analysis five minutes old.
    placeholderData: (prev) => prev,
    retry: 1,
  });
}
