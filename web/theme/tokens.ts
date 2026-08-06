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
/**
 * The pattern itself, as numbers.
 *
 * Web draws it as one CSS gradient; React Native has no `backgroundImage` at
 * all and has to compose it from rotated views (see `Hatch.native.tsx`). Two
 * renderings are unavoidable — two DEFINITIONS are not, and a hatch that is
 * 45° here and 40° there is exactly how "we cannot see here" stops being one
 * mark and starts looking like a texture someone chose.
 */
export const HATCH_PATTERN = {
  angleDeg: 45,
  /** Stroke width, px. */
  lineWidth: 1.5,
  /** Distance from one stroke to the next, px. */
  period: 5,
  /** Neutral by design: this is the absence of a reading, not a low one. */
  color: "rgba(128,128,128,.42)",
} as const;

const { angleDeg, lineWidth, period, color } = HATCH_PATTERN;

export const HATCH = `repeating-linear-gradient(${angleDeg}deg,${color} 0 ${lineWidth}px,transparent ${lineWidth}px ${period}px)`;

export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

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

/**
 * Placeholder ink, as a real value.
 *
 * `placeholderTextColor` is a prop, not a style, so it cannot take a Uniwind
 * class — and left unset, react-native-web falls back to the browser's default,
 * which on this surface renders close enough to full-strength ink that a
 * placeholder reads as a value somebody already typed. That is the worst thing
 * a placeholder can do: it makes an empty required field look complete.
 *
 * Matches --color-ink3, the same weight used for every other "this is not
 * content" mark in the app.
 */
export const PLACEHOLDER = {
  light: "rgba(21, 24, 27, 0.4)",
  dark: "rgba(236, 238, 240, 0.38)",
} as const;

export const DISPLAY = 'Newsreader, Georgia, "Times New Roman", serif';
export const BODY = '"IBM Plex Sans", system-ui, -apple-system, sans-serif';
