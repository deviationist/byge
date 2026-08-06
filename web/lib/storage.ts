/**
 * Saved places, persisted locally.
 *
 * There is no account and no sync — deliberately. That is what makes removal
 * unrecoverable, and why ConfirmSheet says so in as many words rather than just
 * warning that it is.
 */

import { clampCoord } from "./grid";
import { getItem, setItem } from "./kv";

export type SavedLocation = {
  id: string;
  name: string;
  /** Where the place is, for the secondary line — "Grünerløkka, Oslo". */
  place?: string;
  lat: number;
  lon: number;
  /** The watch area. Any rain touching it counts as rain here. */
  radiusKm: number;
};

const KEY = "byge:locations:v1";
const EVER_KEY = "byge:ever-saved:v1";

/** 3 km keeps the verdict about *you*. See RadiusField for why the wide end saturates. */
export const DEFAULT_RADIUS_KM = 3;
export const MIN_RADIUS_KM = 2;
export const MAX_RADIUS_KM = 25;

export function clampRadius(km: number): number {
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(km)));
}

/** Coordinates are clamped on the way in — MET 403s above 4 decimals. */
export function normalise(loc: SavedLocation): SavedLocation {
  return {
    ...loc,
    name: loc.name.trim(),
    lat: clampCoord(loc.lat),
    lon: clampCoord(loc.lon),
    radiusKm: clampRadius(loc.radiusKm),
  };
}

export function loadLocations(): SavedLocation[] {
  try {
    const raw = getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Storage is user-writable and survives version changes, so validate rather
    // than trust. A malformed entry should cost one place, not the whole list.
    return parsed
      .filter(
        (l): l is SavedLocation =>
          l &&
          typeof l.id === "string" &&
          typeof l.name === "string" &&
          Number.isFinite(l.lat) &&
          Number.isFinite(l.lon),
      )
      .map((l) => normalise({ ...l, radiusKm: l.radiusKm ?? DEFAULT_RADIUS_KM }));
  } catch {
    return [];
  }
}

export function saveLocations(list: SavedLocation[]): void {
  setItem(KEY, JSON.stringify(list));
  // Sticky, and deliberately never cleared. It is what tells an empty list
  // apart from a first run — "Nothing saved yet" is the wrong copy for someone
  // who just removed their last place, and the right copy for someone who has
  // never had one. This used to be carried by a `?removed=` route param, which
  // meant the distinction died on reload and travelled in the address bar.
  if (list.length > 0) setItem(EVER_KEY, "1");
}

/** Has this device ever held a saved place? See saveLocations. */
export function hasEverSaved(): boolean {
  return getItem(EVER_KEY) === "1";
}

/**
 * The name of the place removed most recently, for the cleared empty state.
 *
 * DELIBERATELY NOT PERSISTED. It survives the navigation from the screen that
 * removed to the list that reports it, and dies on reload — which is exactly
 * the lifetime the copy wants. "Cabin removed." is right in the seconds after
 * you did it; a week later it would be a stale claim about a place that no
 * longer exists anywhere. After a reload the list falls back to the nameless
 * removal tone, still not the first-run pitch, because `hasEverSaved` persists
 * and this does not.
 *
 * Not in `localStorage` for a second reason: a place name is the most personal
 * thing byge holds, and there is no cause to write it to a second key that
 * nothing ever cleans up.
 */
let lastRemovedName: string | undefined;

export function noteRemoval(name: string): void {
  lastRemovedName = name;
}

export function lastRemoved(): string | undefined {
  return lastRemovedName;
}

export function newId(): string {
  // crypto.randomUUID is unavailable on older Safari, which is a real target
  // for an installed PWA.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `loc-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
