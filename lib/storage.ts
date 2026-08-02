/**
 * Saved places, persisted locally.
 *
 * There is no account and no sync — deliberately. That is what makes removal
 * unrecoverable, and why ConfirmSheet says so in as many words rather than just
 * warning that it is.
 */

import { clampCoord } from "./grid";

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

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadLocations(): SavedLocation[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(KEY);
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
  if (!hasStorage()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function newId(): string {
  // crypto.randomUUID is unavailable on older Safari, which is a real target
  // for an installed PWA.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `loc-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
