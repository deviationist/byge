import { getLocales } from "expo-localization";

/**
 * What languages the user prefers — iOS/Android half.
 *
 * There is no `navigator` on native, so this is the one place `expo-localization`
 * is worth its weight: it reads the system preference list through the platform
 * APIs. Metro resolves the `.native` suffix, so web and the test run never load
 * it.
 *
 * Returns raw BCP 47 tags in preference order, same contract as `device.ts`.
 */
export function preferredLanguages(): string[] {
  return getLocales()
    .map((l) => l.languageTag ?? l.languageCode)
    .filter((tag): tag is string => Boolean(tag));
}
