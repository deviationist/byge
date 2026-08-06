import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { type Verdict, verdict } from "../lib/forecast";
import { latestAnalysis } from "../lib/opendap";
import type { SavedLocation } from "../lib/storage";

/**
 * A verdict degrades rather than expires: an analysis from 10 minutes ago still
 * answers "is it raining now" via its T+10 frame. So cached data is always
 * worth showing, and the app never needs a blocking spinner on open.
 */
const FIVE_MIN = 5 * 60 * 1000;

export function verdictKey(loc: Pick<SavedLocation, "lat" | "lon" | "radiusKm">) {
  return ["verdict", loc.lat, loc.lon, loc.radiusKm] as const;
}

export function useVerdict(loc: SavedLocation | undefined) {
  return useQuery({
    queryKey: loc ? verdictKey(loc) : ["verdict", "none"],
    // skipToken rather than `enabled: !!loc`: it disables the query AND narrows
    // `loc` inside the closure, so the fetch needs no non-null assertions to
    // restate a guard the type system cannot otherwise see.
    queryFn: loc
      ? ({ signal }) => verdict(loc.lat, loc.lon, { radiusKm: loc.radiusKm, signal })
      : skipToken,
    // Render the cached answer instantly, refresh underneath.
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
    refetchOnWindowFocus: true,
    // Keep the previous location's answer on screen while switching, rather
    // than flashing a spinner between two places.
    placeholderData: (prev) => prev,
    retry: 1,
  });
}

/** Verdicts for the whole list, fetched in parallel. */
export function useVerdicts(locations: SavedLocation[]) {
  const results = useQuery({
    queryKey: ["verdicts", locations.map((l) => `${l.lat},${l.lon},${l.radiusKm}`).join("|")],
    enabled: locations.length > 0,
    queryFn: async ({ signal }) => {
      // Per-location fetches beat one merged bounding box unless the points are
      // within a few km of each other; parallel is what makes five locations
      // ~1.7 s instead of ~6.8 s.
      const settled = await Promise.allSettled(
        locations.map((l) => verdict(l.lat, l.lon, { radiusKm: l.radiusKm, signal })),
      );
      const map: Record<string, Verdict> = {};
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") map[locations[i].id] = r.value;
      });
      return map;
    },
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
    // Same as the single verdict, and it has to be: in two-pane both are on
    // screen at once, so without this the list rows could sit an hour stale
    // beside a detail pane that refreshed the moment you came back to the tab —
    // two different answers about the same place, side by side.
    //
    // Neither refetches while the tab is hidden (`refetchIntervalInBackground`
    // defaults to false), so a backgrounded app costs MET nothing.
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    retry: 1,
  });
  return results;
}

export type RefreshOutcome = "updated" | "already-latest" | "failed";

/**
 * Manual refresh.
 *
 * A manual refresh usually finds nothing: analyses publish every 5 minutes with
 * 0-11 minutes of jitter, so tapping refresh frequently returns the file we
 * already hold. Dressing that as a spinner that resolves into no visible change
 * reads as broken and teaches people the button does not work — so
 * "already-latest" is a first-class outcome, not a silent no-op.
 *
 * Resolving the newest filename is a ~25 ms probe, so we can answer "is there
 * anything new" BEFORE paying the ~1.3 s subset fetch.
 */
export function useRefresh(currentAnalysisStamp?: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RefreshOutcome | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const latest = await latestAnalysis();
      if (currentAnalysisStamp && latest.stamp <= currentAnalysisStamp) {
        setOutcome("already-latest");
        return "already-latest" as const;
      }
      await qc.invalidateQueries({ queryKey: ["verdict"] });
      await qc.invalidateQueries({ queryKey: ["verdicts"] });
      setOutcome("updated");
      return "updated" as const;
    } catch {
      setOutcome("failed");
      return "failed" as const;
    } finally {
      setBusy(false);
    }
  }, [qc, currentAnalysisStamp]);

  return { refresh, busy, outcome, clearOutcome: () => setOutcome(null) };
}
