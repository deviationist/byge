/**
 * Values that must be identical across components but cannot live in CSS.
 *
 * `HATCH` is the "not observed" fill. It appears on the Swatch, in the
 * precipitation strip, in the legend and (phase 2) on the map. Four copies is
 * how "we cannot see here" starts looking slightly different in each place and
 * eventually gets mistaken for an intensity.
 *
 * `MONO` is the micro-label face. A CSS token would be cleaner, but these are
 * consumed as React Native style objects, where a `var()` is not resolvable.
 */
export const HATCH =
  "repeating-linear-gradient(45deg,rgba(128,128,128,.42) 0 1.5px,transparent 1.5px 5px)";

export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Type faces.
 *
 * The register is load-bearing, not decorative. The headline is the answer a
 * person reads; the mono face is the machinery talking — coordinates, ages,
 * footnotes, the "at least" caveat. Setting a footnote in the body face makes
 * it read as more prose; setting it in mono marks it as instrumentation.
 *
 * Kept here rather than in global.css because these are consumed as React
 * Native style objects, where `var()` is not resolvable.
 */
/**
 * The app background, per theme, as real values.
 *
 * Duplicates `--color-bg` from global.css on purpose: expo-router's
 * `contentStyle` is a React Native style object handed to the navigator, not a
 * component we can put a className on, so neither a `var()` nor a Uniwind class
 * can reach it. Keep these in step with `@theme static` — they are the same two
 * colours the manifest and SplashScreen also hardcode, for the same reason.
 */
export const BG = { light: "#f6f4f0", dark: "#0e1113" } as const;

export const DISPLAY = 'Newsreader, Georgia, "Times New Roman", serif';
export const BODY = '"IBM Plex Sans", system-ui, -apple-system, sans-serif';
