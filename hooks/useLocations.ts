import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_RADIUS_KM,
  loadLocations,
  newId,
  normalise,
  type SavedLocation,
  saveLocations,
} from "../lib/storage";

export type NewLocation = Omit<SavedLocation, "id"> & { id?: string };

/**
 * The saved-places list.
 *
 * Loaded synchronously on first render so the list never flashes empty — an
 * empty state that appears for one frame reads as "your places are gone".
 */
export function useLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>(loadLocations);

  useEffect(() => {
    saveLocations(locations);
  }, [locations]);

  const add = useCallback((loc: NewLocation) => {
    const created = normalise({
      ...loc,
      id: loc.id ?? newId(),
      radiusKm: loc.radiusKm ?? DEFAULT_RADIUS_KM,
    });
    setLocations((prev) => [...prev, created]);
    return created;
  }, []);

  const update = useCallback((id: string, patch: Partial<SavedLocation>) => {
    setLocations((prev) =>
      prev.map((l) => (l.id === id ? normalise({ ...l, ...patch, id }) : l)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const byId = useCallback(
    (id: string | undefined) => locations.find((l) => l.id === id),
    [locations],
  );

  /**
   * Where to go after deleting `id`.
   *
   * On two-pane the detail pane was showing the thing just removed, so it needs
   * a real answer rather than a blank. Prefer the neighbour that took its
   * place, else the new last item, else nothing.
   */
  const neighbourOf = useCallback(
    (id: string): SavedLocation | null => {
      const i = locations.findIndex((l) => l.id === id);
      if (i === -1) return null;
      const rest = locations.filter((l) => l.id !== id);
      if (rest.length === 0) return null;
      return rest[Math.min(i, rest.length - 1)];
    },
    [locations],
  );

  return { locations, add, update, remove, byId, neighbourOf };
}
