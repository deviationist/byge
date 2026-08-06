import { useQuery } from "@tanstack/react-query";
import { type BandField, decodeField } from "../lib/fieldFormat";
import { cellOf, NX, NY } from "../lib/grid";
import { API_BASE, CLIENT_KEY, latestAnalysis } from "../lib/opendap";

/**
 * A window of the radar field, sized to what is on screen.
 *
 * The window follows the VIEWPORT rather than a saved place, which is the whole
 * difference between this and `useRadarGrid`: there is no location here, so
 * there is nothing to centre on but the map itself.
 *
 * STRIDE FOLLOWS ZOOM, and it is free to. MET decompresses a whole frame
 * whatever slice you ask for, so sampling every fourth cell for a national view
 * costs the server exactly what sampling every cell would — it only changes
 * what comes back. See the timings in api/internal/field.
 *
 * FRAMES ARE THE BUDGET. They are the one axis that costs, and the proxy caps
 * the product of everything. So a wide view asks for fewer frames and a close
 * one can afford all 24 — which is also the right behaviour for a reader: at
 * national scale you want to see the weather move, and at street scale you want
 * the detail.
 */

export type FieldRequest = {
  /** Viewport centre. */
  lat: number;
  lon: number;
  zoom: number;
  /** Viewport size in CSS pixels, so the window covers what is visible. */
  width: number;
  height: number;
};

export function useRadarField(req: FieldRequest | null) {
  const plan = req ? planWindow(req) : null;

  return useQuery({
    queryKey: plan
      ? ["radar-field", plan.row0, plan.col0, plan.rows, plan.cols, plan.stride, plan.frames]
      : ["radar-field", "none"],
    enabled: !!plan,
    queryFn: async ({ signal }): Promise<BandField> => {
      if (!plan) throw new Error("no window");
      const analysis = await latestAnalysis(signal);
      const url =
        `${API_BASE}/field?base=${encodeURIComponent(analysis.base)}` +
        `&row0=${plan.row0}&col0=${plan.col0}&rows=${plan.rows}&cols=${plan.cols}` +
        `&stride=${plan.stride}&frames=${plan.frames}`;
      const res = await fetch(url, {
        signal,
        headers: CLIENT_KEY ? { "X-Byge-Key": CLIENT_KEY } : undefined,
      });
      if (!res.ok) throw new Error(`field ${res.status}`);
      // The browser has already un-gzipped this; what arrives is the quantised
      // field itself.
      return decodeField(await res.arrayBuffer());
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
}

/**
 * Which cells to ask for, given where the map is looking.
 *
 * Exported for the tests: every number here is a silent failure if it is wrong.
 * Too small a window leaves a visible rectangle of weather in the middle of the
 * screen; too large wastes bytes nobody sees; a bad stride draws the country
 * squashed into a corner.
 */
export function planWindow(req: FieldRequest) {
  const mpp = (156543.03392 * Math.cos((req.lat * Math.PI) / 180)) / 2 ** req.zoom;
  const spanCols = Math.ceil((req.width * mpp * 1.5) / 1000);
  const spanRows = Math.ceil((req.height * mpp * 1.5) / 1000);

  const { row, col } = safeCell(req.lat, req.lon);
  const row0 = clamp(row - Math.floor(spanRows / 2), 0, NY - 1);
  const col0 = clamp(col - Math.floor(spanCols / 2), 0, NX - 1);

  // Full resolution and the full horizon, both, at every zoom.
  //
  // Frames used to be rationed against area, which is why a national view
  // stopped at +20 min: each frame was a separate slice fetched from MET, so
  // twenty-four of them was 67 MB for one person looking at one rectangle. The
  // proxy now holds whole frames and slices them from memory, so asking for all
  // 24 costs it nothing beyond the bytes — and the bytes are small, because
  // consecutive frames of a rain field are very alike and gzip together well.
  return {
    row0,
    col0,
    rows: Math.max(1, spanRows),
    cols: Math.max(1, spanCols),
    stride: 1,
    frames: 24,
  };
}

/**
 * The grid throws outside its domain, and a map can legitimately be panned into
 * the Atlantic. Clamping to the nearest edge cell keeps the request valid; the
 * server clamps the window too, and the response says what it actually read.
 */
function safeCell(lat: number, lon: number) {
  try {
    return cellOf(lat, lon);
  } catch {
    return { row: Math.floor(NY / 2), col: Math.floor(NX / 2) };
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
