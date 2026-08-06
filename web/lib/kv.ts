/**
 * The one place this app talks to persistent storage.
 *
 * Deliberately SYNCHRONOUS. `loadLocations()` is called straight from
 * `useState(loadLocations)` so the saved list is present on the very first
 * render — an empty state that appears for one frame reads as "your places are
 * gone". An async store would reintroduce exactly that flash, so AsyncStorage
 * is not an option here and neither is anything Promise-based.
 *
 * This file is the WEB implementation and the default. `kv.native.ts` sits
 * beside it for iOS and Android; Metro resolves the platform suffix, so web
 * and the test run both land here and neither ever loads the native module.
 * Adding a platform is a new file, not a branch in this one.
 *
 * Everything is best-effort. Storage can be absent (SSR, a prerender pass) or
 * refuse to write (Safari private mode, quota), and none of that is worth
 * losing a verdict over — a failed write costs the next session's convenience,
 * not this session's answer.
 */

function available(): boolean {
  return typeof localStorage !== "undefined";
}

export function getItem(key: string): string | null {
  if (!available()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  if (!available()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota or a private-mode refusal. Nothing useful to do, and nothing worth
    // interrupting the user for.
  }
}

export function removeItem(key: string): void {
  if (!available()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
