/**
 * The iOS/Android half of `kv.ts`. Metro picks this file by its `.native`
 * suffix; web and the vitest run never resolve it, so `expo-sqlite` stays out
 * of the web bundle entirely.
 *
 * `expo-sqlite/kv-store` rather than AsyncStorage, for one reason: it exposes
 * SYNCHRONOUS accessors. The saved list is read inside `useState(loadLocations)`
 * so it is on screen at first paint, and every Promise-based store would turn
 * that into a frame of empty state — which reads as "your places are gone".
 * The API is otherwise AsyncStorage-shaped, so the sync variants are the whole
 * reason this dependency is here.
 *
 * Same best-effort contract as the web side: a store that cannot be read or
 * written costs the next session's convenience, never this session's answer.
 */

import Storage from "expo-sqlite/kv-store";

export function getItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Disk full, or a store that failed to open. Not worth interrupting for.
  }
}

export function removeItem(key: string): void {
  try {
    Storage.removeItemSync(key);
  } catch {
    // As above.
  }
}
