/**
 * Reader for the radar slabs byge's own API serves.
 *
 * IT NO LONGER KNOWS WHERE THE DATA COMES FROM, and that is the point. This
 * module used to hold `thredds.met.no`, MET's filename scheme, and a builder
 * that handed a finished upstream URL to the proxy for forwarding — which made
 * the proxy an open relay guarded by a prefix check, and duplicated knowledge of
 * MET's naming on both sides of the wire where it could drift.
 *
 * Now the client sends parameters and the server owns the upstream entirely.
 * What remains here is the half that genuinely belongs in the browser: how to
 * READ the response. The wire format is still OPeNDAP's `.ascii`, because that
 * is what our API relays, and parsing it is pure and testable.
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

/**
 * Everything goes through byge's own API, and it is not optional.
 *
 * Three things make a direct call to MET from a browser impossible, not merely
 * awkward. `thredds.met.no` sends no CORS headers on any of its service paths,
 * so the fetch is blocked outright. MET's terms require an identifying
 * User-Agent, and `User-Agent` is a forbidden header in the Fetch API — a
 * browser physically cannot send one, so a direct call would be anonymous and
 * in breach even if CORS allowed it. And MET ask that clients not hammer them,
 * which one shared cache satisfies and a thousand browsers cannot.
 *
 * The API is stateless: it adds the agent, adds CORS, and caches. It stores
 * nothing and logs no coordinate, so byge's "everything stays on this device"
 * is still true.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://byge-api.ichiva.no";

/**
 * Shared key for the API. Deterrence, not authentication — anyone reading this
 * bundle can lift it, which is understood. It means encountering the API is not
 * the same as being able to consume it, and the real bound on volume is the
 * per-IP rate limit behind it.
 */
export const CLIENT_KEY = process.env.EXPO_PUBLIC_CLIENT_KEY ?? "";

/**
 * The one place the key is attached, so no call site can forget it and no call
 * site can invent a destination. Every argument is a path we wrote.
 */
export function apiUrl(path: string, params: Record<string, string | number>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  const query = q.toString();
  // No trailing `?` on a bare path: `/analysis` and `/analysis?` are the same
  // request but different cache keys, in the browser and in anything in front
  // of it.
  return query ? `${API_BASE}${path}?${query}` : `${API_BASE}${path}`;
}

export function apiHeaders(): Record<string, string> | undefined {
  return CLIENT_KEY ? { "X-Byge-Key": CLIENT_KEY } : undefined;
}

/** _FillValue is 9.96921e36 — cells the radar mosaic cannot see. NOT zero. */
export const FILL_THRESHOLD = 1e30;

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

export type Analysis = {
  /** Valid time of frame 0 — also the filename stamp. */
  time: Date;
  stamp: string;
};

/**
 * A stamp is the ONLY handle the client has on an upstream file.
 *
 * It used to carry a URL alongside it, which is what let the client hand the
 * proxy a finished destination. Now it is sixteen characters of fixed-width
 * date that the server validates against a regex before it goes anywhere near a
 * hostname — so the worst a hostile stamp can do is get a 400.
 */
export function analysisFor(stamp: string): Analysis {
  const t = Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(9, 11)),
    Number(stamp.slice(11, 13)),
  );
  return { time: new Date(t), stamp };
}

/**
 * Which radar run is current.
 *
 * The walk that finds it — probing five-minute marks backwards until one is
 * published, because publication lag drifts 0–11 minutes — now happens on the
 * server. It has to: the client cannot probe filenames it is no longer allowed
 * to name, and the server was already doing the same walk for its frame warmer.
 * One implementation, one answer, and one fewer copy of MET's naming scheme.
 */
export async function latestAnalysis(signal?: AbortSignal): Promise<Analysis> {
  const res = await fetch(apiUrl("/analysis", {}), { signal, headers: apiHeaders() });
  if (!res.ok) throw new OpenDapError(`analysis ${res.status}`, res.status);
  const body = (await res.json()) as { stamp?: string };
  if (!body.stamp) throw new OpenDapError("no published analysis");
  return analysisFor(body.stamp);
}

/** A window of grid cells, in the shape the API takes. */
export type SlabWindow = { row0: number; col0: number; rows: number; cols: number };

/**
 * Read a window of raw values for one analysis.
 *
 * The caller says WHICH CELLS, never which file and never which subset
 * expression. The server builds the hyperslab, which is why the frame span is
 * not a parameter: a verdict always wants the whole run, and letting a caller
 * choose only adds a way to get it wrong.
 */
export async function fetchSlab(
  stamp: string,
  win: SlabWindow,
  signal?: AbortSignal,
): Promise<Map<string, Variable>> {
  const res = await fetch(apiUrl("/slab", { stamp, ...win }), {
    signal,
    headers: apiHeaders(),
  });
  if (!res.ok) throw new OpenDapError(`slab ${res.status}`, res.status);
  return parseAscii(await res.text());
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
