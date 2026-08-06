import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { getItem, removeItem, setItem } from "../lib/kv";
import { preferredLanguages } from "./device";
import en from "./locales/en.json";
import nb from "./locales/nb.json";

/**
 * Copy lives here, not in the markup.
 *
 * byge is a Norwegian app written in English first, and now in Norwegian too.
 * `nb` is a full translation rather than a partial one — a half-filled bundle
 * falls back per key, which produces a screen in two languages at once, and
 * that reads worse than either language alone.
 *
 * A few of them are choices rather than translations, and worth knowing:
 * "Dry." is «Opphold.», the meteorological term a Norwegian actually expects,
 * not the literal «Tørt»; and the hours/minutes joiner is its own key because
 * Norwegian says «og» where English says "and". The design notes also flag that
 * the relative time form may be the natural one in Norwegian and the clock the
 * redundant half. Both are kept for now — dropping one is a copy decision
 * about what byge says, not about how it is spelled, and it should be made
 * deliberately rather than as a side effect of translating.
 *
 * Where the device preference comes from is split per platform in `device.ts` /
 * `device.native.ts` — the browser exposes `navigator.languages`, native needs
 * `expo-localization`. Narrowing that list to what we ship happens here, once,
 * so the two platforms cannot come to different conclusions about it.
 */
export const SUPPORTED = ["en", "nb"] as const;
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

const KEY = "byge:language";

export type LanguageChoice = Language | "system";

/**
 * What the reader chose, or "system" if they never did.
 *
 * Stored ONLY when it differs from following the device, mirroring how the
 * theme choice is kept: absence is a meaningful state, and writing "system"
 * would make "never chose" indistinguishable from "chose to follow", which
 * matters the day the device language changes.
 */
export function languageChoice(): LanguageChoice {
  const v = getItem(KEY);
  return v && (SUPPORTED as readonly string[]).includes(v) ? (v as Language) : "system";
}

/** The language to actually render in. */
export function resolveLanguage(choice: LanguageChoice = languageChoice()): Language {
  return choice === "system" ? deviceLanguage() : choice;
}

export function chooseLanguage(choice: LanguageChoice): void {
  if (choice === "system") removeItem(KEY);
  else setItem(KEY, choice);
  void i18next.changeLanguage(resolveLanguage(choice));
}

i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, nb: { translation: nb } },
  lng: resolveLanguage(),
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
