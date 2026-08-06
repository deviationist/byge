import { useCallback, useState } from "react";
import { getItem, removeItem, setItem } from "../lib/kv";
import { deviceLanguage, type Language, SUPPORTED } from "./index";

export type LanguageChoice = Language | "system";

const KEY = "byge:language";

/**
 * Language, with the same shape as the theme preference.
 *
 * Deliberately mirrors `theme/useTheme.ts`: a stored choice, a "system" value
 * that follows the device, and a resolver between them. Two preferences that
 * behave identically are two preferences a person only has to learn once — and
 * it means the language control can reuse `SegmentedControl` exactly as
 * Appearance does, resolved-value caption and all.
 *
 * Persistence goes through `lib/kv`, so unlike the theme choice before it, this
 * works on native from the first commit rather than silently no-opping there.
 */
export function storedChoice(): LanguageChoice {
  const v = getItem(KEY);
  return v && (SUPPORTED as readonly string[]).includes(v) ? (v as Language) : "system";
}

export function resolveLanguage(choice: LanguageChoice, device: Language): Language {
  return choice === "system" ? device : choice;
}

export function useLocale() {
  const [choice, setChoice] = useState<LanguageChoice>(storedChoice);
  const device = deviceLanguage();
  const language = resolveLanguage(choice, device);

  const choose = useCallback((next: LanguageChoice) => {
    setChoice(next);
    if (next === "system") removeItem(KEY);
    else setItem(KEY, next);
  }, []);

  return { language, choice, choose, device };
}
