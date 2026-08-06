import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { preferredLanguages } from "./device";
import en from "./locales/en.json";

/**
 * Copy lives here, not in the markup.
 *
 * byge is a Norwegian app written in English first. Norwegian is not written
 * yet — the design notes flag that the relative time form may be the natural
 * one there and the clock the redundant half, which is a copy decision rather
 * than a translation — so `en` is the only bundle for now and `nb` drops in
 * beside it when those decisions land. Registering one language today still
 * buys the important thing: strings stop being spelled inline, so adding a
 * second is a file rather than a sweep.
 *
 * Where the device preference comes from is split per platform in `device.ts` /
 * `device.native.ts` — the browser exposes `navigator.languages`, native needs
 * `expo-localization`. Narrowing that list to what we ship happens here, once,
 * so the two platforms cannot come to different conclusions about it.
 */
export const SUPPORTED = ["en"] as const;
export type Language = (typeof SUPPORTED)[number];

export const FALLBACK: Language = "en";

/**
 * What the device asks for, narrowed to what we actually have.
 *
 * `getLocales()` returns the user's ordered preference list, so take the first
 * one we can serve rather than only inspecting the top entry — someone with
 * Norwegian first and English second should get English, not the fallback by
 * accident.
 */
export function deviceLanguage(): Language {
  for (const tag of preferredLanguages()) {
    // "nb-NO" and "nb" are the same answer to this question.
    const base = tag.split("-")[0].toLowerCase();
    if ((SUPPORTED as readonly string[]).includes(base)) return base as Language;
  }
  return FALLBACK;
}

i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: FALLBACK,
  fallbackLng: FALLBACK,
  // Copy is written as sentences; React escapes what it renders anyway, and
  // i18next's own escaping would mangle the apostrophes and dashes this app
  // deliberately uses.
  interpolation: { escapeValue: false },
  // A missing key should be loud in development and harmless in production —
  // never a blank space where a sentence was.
  returnEmptyString: false,
});

export default i18next;
