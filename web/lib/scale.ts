import i18next from "i18next";
/**
 * Precipitation intensity scale, matched to yr.no's own colour bands.
 *
 * The boundaries are not guessed. They were fitted against 33 836 paired
 * samples of (our mm/h value, yr's rendered tile colour) at the same coordinate
 * and valid time, choosing for each band the threshold that best separates it —
 * accuracy 94.9 % on the faintest band rising to 99.8 % on the heaviest.
 *
 * Using yr's palette means a user who knows the yr map reads ours for free.
 * If you change these, refit — don't hand-adjust.
 */

export type Band = {
  index: number;
  /** mm/h, inclusive lower bound */
  floor: number;
  /** yr's own rendered colour — light theme */
  light: string;
  /** dark-theme equivalent: same hue order, luminance inverted so intensity
   *  still reads as "brighter". Not a tint of `light`. */
  dark: string;
  /**
   * The i18n key stem for this band's name and sensation — `band.heavy` and
   * `band.heavyFeels`. NOT the words themselves: a band is a physical fact (a
   * floor in mm/h and a colour) and facts do not translate, only the words for
   * them do. Storing English here made the entire scale monolingual on a screen
   * the reader had switched to Norwegian, and nothing about a colour ramp looks
   * like copy, so it went unnoticed.
   */
  key: string;
};

export const BANDS: readonly Band[] = [
  {
    index: 0,
    floor: 0,
    light: "transparent",
    dark: "transparent",
    key: "dry",
  },
  {
    index: 1,
    floor: 0.03,
    light: "#91E4FF",
    dark: "#1F4A5A",
    key: "trace",
  },
  {
    index: 2,
    floor: 0.055,
    light: "#5ED7FF",
    dark: "#2A6B82",
    key: "drizzle",
  },
  {
    index: 3,
    floor: 0.195,
    light: "#00AAFF",
    dark: "#3A9BC4",
    key: "light",
  },
  {
    index: 4,
    floor: 1.0,
    light: "#0080FF",
    dark: "#55AEF5",
    key: "moderate",
  },
  {
    index: 5,
    floor: 5.7,
    light: "#0055FF",
    dark: "#7EC0FF",
    key: "heavy",
  },
  {
    index: 6,
    floor: 23.7,
    light: "#7A0087",
    dark: "#E8BCF4",
    key: "torrential",
  },
] as const;

/**
 * The exact RGB triples yr.no renders, ascending by intensity. Used to decode
 * their tiles, and pinned so a silent palette change on their side fails a test
 * rather than quietly invalidating the fitted boundaries above.
 */
export const PALETTE: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [145, 228, 255],
  [94, 215, 255],
  [0, 170, 255],
  [0, 128, 255],
  [0, 85, 255],
  [122, 0, 135],
] as const;

/**
 * yr renders "outside radar coverage" as white — deliberately distinct from the
 * black used for "dry, and we can see that it is dry". Verified: white pixels
 * coincide with _FillValue in our own grid 97 % of the time, the remainder being
 * subpixel misalignment along the coverage boundary.
 *
 * Never fold this into PALETTE. Treating no-data as an intensity would render
 * "we cannot see here" as "it is dry here", which is precisely the kind of
 * confident-but-wrong answer this project exists to avoid.
 */
export const NO_DATA: readonly [number, number, number] = [255, 255, 255];

/**
 * Rate at or above which we consider it "raining". Band 3 is the first level a
 * person actually notices; bands 1–2 are radar picking up moisture you would
 * not call rain.
 */
export const NOTICEABLE = BANDS[3].floor;

/** Which yr colour band a given mm/h falls in. */
export function bandOf(rate: number): Band {
  let hit = BANDS[0];
  for (const b of BANDS) if (rate >= b.floor) hit = b;
  return hit;
}

export function colorOf(band: Band, theme: "light" | "dark"): string {
  return theme === "dark" ? band.dark : band.light;
}

/**
 * The band's name, and what that much rain feels like.
 *
 * Resolved through i18next at CALL time rather than stored on the band. A band
 * is a physical fact — a floor in mm/h and a colour — and those do not
 * translate; only the words for them do. Keeping the words in the table meant
 * the whole scale was English, including on a screen the reader had set to
 * Norwegian, because nothing about a colour ramp looks like copy.
 */
export function bandLabel(b: Band): string {
  return b.index === 0 ? i18next.t("band.dry") : i18next.t(`band.${b.key}`);
}

export function bandFeelsLike(b: Band): string {
  return b.index === 0 ? i18next.t("legend.dryFeels") : i18next.t(`band.${b.key}Feels`);
}

/** e.g. "6.0 mm/h — heavy rain (soaked in minutes)" */
export function describeRate(rate: number): string {
  const b = bandOf(rate);
  if (b.index === 0) return i18next.t("band.dry");
  return i18next.t("band.describe", {
    rate: rate.toFixed(1),
    label: bandLabel(b),
    feels: bandFeelsLike(b),
  });
}

export type LegendRow = {
  label: string;
  light: string;
  dark: string;
  from: number;
  to: number | null;
  range: string;
  feelsLike: string;
};

/** Scale rows for the legend, coarse to fine. */
export function legend(): LegendRow[] {
  const out: LegendRow[] = [];
  for (let i = 1; i < BANDS.length; i++) {
    const b = BANDS[i];
    const next = i + 1 < BANDS.length ? BANDS[i + 1].floor : null;
    out.push({
      label: bandLabel(b),
      light: b.light,
      dark: b.dark,
      from: b.floor,
      to: next,
      range:
        next === null
          ? i18next.t("band.rangeFrom", { from: b.floor })
          : i18next.t("band.rangeBetween", { from: b.floor, to: next }),
      feelsLike: bandFeelsLike(b),
    });
  }
  return out;
}
