/**
 * What languages the user prefers — web half.
 *
 * `navigator.languages` is the ordered preference list every browser exposes,
 * and it is what `expo-localization` reads on web anyway. Going direct keeps
 * Expo's native module out of the web bundle and out of the test run, where it
 * has no runtime to attach to and throws on import.
 *
 * Returns raw BCP 47 tags in preference order. Narrowing to what we actually
 * ship is `i18n/index.ts`'s job, so the two platforms cannot disagree about it.
 */
export function preferredLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  const list = navigator.languages;
  if (list && list.length > 0) return [...list];
  return navigator.language ? [navigator.language] : [];
}
