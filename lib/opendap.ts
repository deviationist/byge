/**
 * OPeNDAP client for thredds.met.no.
 *
 * The `.ascii` response is structured, not soup:
 *
 *     Dataset { ...DDS... } <name>;
 *     ---------------------------------------------
 *     lwe_precipitation_rate.lwe_precipitation_rate[3][3][3]
 *     [0][0], 0.0, 0.0, 0.0
 *     [0][1], 0.0, 0.0, 0.0
 *     ...
 *
 *     lwe_precipitation_rate.time[3]
 *     1785613200, 1785613500, 1785613800
 *
 * Blocks are separated by blank lines. Each begins with `name[dim][dim]…`, and
 * for an N-D array every following row carries an `[i][j]` index prefix before
 * the values of the final dimension.
 *
 * The Python spike scraped every float it could find and relied on the data
 * block coming first. That works, but it cannot tell you *which* variable a
 * number belongs to, and it fails silently if the response shape ever changes.
 * This parses by name.
 */

import { NFRAMES, NX, NY, STEP_S } from "./grid";

export const DODS = "https://thredds.met.no/thredds/dodsC/";
export const STEM =
  "radarnowcasting/yrwms-nordic.mos.pcappi-0-rr." +
  "noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.{}.nc";

/** MET's terms require an identifying User-Agent with contact details. */
export const USER_AGENT = "byge/0.1 (https://github.com/deviationist/byge)";

/** _FillValue is 9.96921e36 — cells the radar mosaic cannot see. NOT zero. */
export const FILL_THRESHOLD = 1e30;

/** How far back to walk when the newest analyses have not published yet. */
const MAX_LOOKBACK = 8;

export class OpenDapError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenDapError";
  }
}

export type Variable = {
  name: string;
  dims: number[];
  values: Float64Array;
};

/**
 * Parse an OPeNDAP ASCII payload into variables keyed by name.
 *
 * Grid responses qualify names as `grid.member`; we key on the member so
 * callers ask for `lwe_precipitation_rate`, `time`, `Xc`, `Yc`.
 */
export function parseAscii(body: string): Map<string, Variable> {
  const sep = body.indexOf("\n---");
  if (sep === -1) {
    // OPeNDAP reports errors as a text body with a 200 in some deployments.
    throw new OpenDapError(`unexpected OPeNDAP response: ${body.slice(0, 200)}`);
  }
  const payload = body.slice(body.indexOf("\n", sep + 1) + 1);

  const out = new Map<string, Variable>();
  for (const block of payload.split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;

    const header = lines[0].trim();
    const m = header.match(/^([\w.]+)((?:\[\d+\])+)$/);
    if (!m) continue;

    const qualified = m[1];
    const name = qualified.includes(".")
      ? qualified.slice(qualified.lastIndexOf(".") + 1)
      : qualified;
    const dims = [...m[2].matchAll(/\[(\d+)\]/g)].map((d) => Number(d[1]));
    const total = dims.reduce((a, b) => a * b, 1);

    const values = new Float64Array(total);
    let i = 0;
    for (const line of lines.slice(1)) {
      // Strip the leading `[i][j], ` index prefix on N-D rows. 1-D arrays have
      // no prefix, so the regex simply doesn't match and nothing is removed.
      const data = line.replace(/^\s*(?:\[\d+\])+\s*,\s*/, "");
      for (const tok of data.split(",")) {
        const t = tok.trim();
        if (!t) continue;
        if (i >= total) break;
        values[i++] = Number(t);
      }
    }
    if (i !== total) {
      throw new OpenDapError(`${name}: expected ${total} values, parsed ${i}`);
    }
    out.set(name, { name, dims, values });
  }
  return out;
}

async function get(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal });
  if (!res.ok) throw new OpenDapError(`${res.status} for ${url}`, res.status);
  return res.text();
}

/** Fetch and parse a subset expression, e.g. `lwe_precipitation_rate[0:1:23][…]`. */
export async function fetchVars(
  base: string,
  query: string,
  signal?: AbortSignal,
): Promise<Map<string, Variable>> {
  return parseAscii(await get(`${base}.ascii?${encodeURI(query)}`, signal));
}

export type Analysis = {
  /** OPeNDAP base URL, no extension. */
  base: string;
  /** Valid time of frame 0 — also the filename stamp. */
  time: Date;
  stamp: string;
};

function stampOf(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`
  );
}

export function analysisFor(stamp: string): Analysis {
  const t = Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(9, 11)),
    Number(stamp.slice(11, 13)),
  );
  return { base: DODS + STEM.replace("{}", stamp), time: new Date(t), stamp };
}

/** The 5-minute marks from `from` backwards, newest first. */
export function candidateStamps(from: Date = new Date(), count = MAX_LOOKBACK): string[] {
  const floor = new Date(from);
  floor.setUTCSeconds(0, 0);
  floor.setUTCMinutes(floor.getUTCMinutes() - (floor.getUTCMinutes() % 5));
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    out.push(stampOf(new Date(floor.getTime() - k * STEP_S * 1000)));
  }
  return out;
}

/**
 * Resolve the newest published analysis.
 *
 * Filenames are deterministic 5-minute marks, so we probe them directly instead
 * of fetching the 277 KB catalogue (which carries no ETag, Last-Modified or
 * Cache-Control and therefore cannot be cached). A `.dds` probe is ~1 KB and
 * 404s cleanly before publication.
 *
 * Publication lag drifts 0–11 minutes, so never assume `now - 5min` exists.
 */
export async function latestAnalysis(signal?: AbortSignal): Promise<Analysis> {
  for (const stamp of candidateStamps()) {
    const a = analysisFor(stamp);
    try {
      await get(`${a.base}.dds`, signal);
      return a;
    } catch (e) {
      if (e instanceof OpenDapError && e.status === 404) continue;
      throw e;
    }
  }
  throw new OpenDapError("no published analysis in the last 40 minutes");
}

/**
 * Is there a newer analysis than the one we hold?
 *
 * Cheap enough to answer *before* fetching any data (~25 ms), which is what
 * lets a manual refresh report "already the latest" instantly instead of
 * spinning through a full subset fetch to discover nothing changed.
 */
export async function hasNewerThan(
  stamp: string,
  signal?: AbortSignal,
): Promise<Analysis | null> {
  const latest = await latestAnalysis(signal);
  return latest.stamp > stamp ? latest : null;
}

/** Frame valid times, derived from the stamp — no request needed. */
export function frameTimes(a: Analysis): Date[] {
  return Array.from(
    { length: NFRAMES },
    (_, i) => new Date(a.time.getTime() + i * STEP_S * 1000),
  );
}

/** Clamp a cell window to the grid. */
export function clampWindow(row: number, col: number, r: number) {
  return {
    r0: Math.max(0, row - r),
    r1: Math.min(NY - 1, row + r),
    c0: Math.max(0, col - r),
    c1: Math.min(NX - 1, col + r),
  };
}
