import { createContext, type ReactNode, useContext } from "react";
import { type Theme, type ThemeChoice, useTheme } from "./useTheme";

type ThemeContextValue = {
  theme: Theme;
  choice: ThemeChoice;
  choose: (next: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Resolves the theme once at the root and hands it down.
 *
 * Components take `theme` as an explicit prop rather than reading context
 * directly — that keeps every one of them renderable in isolation and testable
 * in both themes without a provider. This context exists for the screens, which
 * need to know which value to pass.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used inside ThemeProvider");
  return ctx;
}

/** Just the resolved theme, for the common case. */
export function useResolvedTheme(): Theme {
  return useThemeContext().theme;
}
