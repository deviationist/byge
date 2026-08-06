import { useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";
import { getItem, removeItem, setItem } from "../lib/kv";

export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = "byge:theme";

/**
 * Read the stored preference synchronously so the first paint is correct.
 *
 * Went through lib/kv so this now persists on native too. It previously
 * early-returned "system" off web, which meant an explicit choice silently
 * failed to survive a restart on iOS and Android.
 */
function storedChoice(): ThemeChoice {
  const v = getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function systemTheme(): Theme {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

export function resolveTheme(choice: ThemeChoice, system: Theme): Theme {
  return choice === "system" ? system : choice;
}

/**
 * Applies the theme to the document root on web.
 *
 * Uniwind's `.dark` overrides are class-based, so the class has to be on the
 * root element or the whole dark palette silently never applies.
 */
function applyToDocument(theme: Theme) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice);
  const [system, setSystem] = useState<Theme>(systemTheme);

  // Follow the OS while the choice is "system" — and keep listening even when
  // it is not, so switching back to "system" is instantly correct.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === "dark" ? "dark" : "light");
    });
    return () => sub.remove();
  }, []);

  const theme = resolveTheme(choice, system);
  useEffect(() => applyToDocument(theme), [theme]);

  function choose(next: ThemeChoice) {
    setChoice(next);
    if (next === "system") removeItem(KEY);
    else setItem(KEY, next);
  }

  return { theme, choice, choose };
}
