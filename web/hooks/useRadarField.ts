import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type BandField, decodeField, readFieldStream } from "../lib/fieldFormat";
import { cellOf, NFRAMES, NX, NY } from "../lib/grid";
import { apiHeaders, apiUrl, latestAnalysis } from "../lib/opendap";

/**
 * A window of the radar field, sized to what is on screen.
 *
 * TAKES ITS FRAME COUNT FROM THE CALLER, because the two callers want different
 * runs: the map wants everything the window can afford, and the verdict's
 * preview wants exactly one still.
 *
 * IT DELIVERS THAT RUN INCREMENTALLY. `/field` streams a frame at a time, and
 * each newly complete one is published under this query's key — so `data` is a
 * drawable field from the moment frame 0 lands and grows until the run is in.
 * A caller that only cares about the finished article can ignore that and read
 * `data` when `isFetching` goes false; one that wants to start playing early
 * reads `frames` against `expected`.
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

export function useRadarField(req: FieldRequest | null, frames: number, enabled = true) {
  const client = useQueryClient();
  const plan = req ? planWindow(req) : null;
  const queryKey = plan
    ? (["radar-field", plan.row0, plan.col0, plan.rows, plan.cols, plan.stride, frames] as const)
    : (["radar-field", "none"] as const);

  return useQuery({
    queryKey,
    enabled: !!plan && enabled,
    queryFn: async ({ signal }): Promise<BandField> => {
      if (!plan) throw new Error("no window");
      const analysis = await latestAnalysis(signal);
      // A stamp, not a URL. The server knows which file that names; this side
      // could not construct one if it wanted to.
      const res = await fetch(
        apiUrl("/field", {
          stamp: analysis.stamp,
          row0: plan.row0,
          col0: plan.col0,
          rows: plan.rows,
          cols: plan.cols,
          // No stride. It was a parameter back when the server forwarded a
          // constraint expression the client had written; now the server slices
          // whole frames it already holds, where sampling saves nothing. Sending
          // one it ignores would be a parameter that lies about what it does.
          frames,
        }),
        { signal, headers: apiHeaders() },
      );
      if (!res.ok) throw new Error(`field ${res.status}`);

      // The browser has already un-gzipped this; what arrives is the quantised
      // field itself. `res.body` is absent in jsdom and in a few old browsers,
      // so the buffered path stays as the fallback rather than as dead code.
      if (!res.body) return decodeField(await res.arrayBuffer());

      // PUBLISHED AS IT ARRIVES.
      //
      // React Query has one result per query, which for a stream would mean the
      // whole run or nothing — exactly the wait this is meant to remove. So
      // every newly complete frame is written into the cache under this query's
      // own key, and the resolved value is simply the last of them. Observers
      // re-render on each, `isFetching` stays true throughout, and the map can
      // paint frame 0 and start playing while frame 23 is still on the wire.
      let latest: BandField | null = null;
      for await (const partial of readFieldStream(res.body)) {
        latest = partial;
        // The final one is skipped here and returned instead — writing it twice
        // would render the same field two frames running for no reason.
        if (partial.frames < partial.expected) client.setQueryData(queryKey, partial);
      }
      if (!latest) throw new Error("field: nothing arrived");
      return latest;
    },
    staleTime: 5 * 60 * 1000,
    // A field is up to 17 MB of cells. React Query keeps unused queries for
    // five minutes by default, which for anything else is a sensible cache and
    // here is a leak: a few pans and the tab is holding a hundred megabytes it
    // will never show again. Sixty seconds is long enough to make a pan back
    // free and short enough that the heap does not grow with exploration.
    gcTime: 60 * 1000,
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

  // SNAPPED TO A COARSE LATTICE, which is what makes panning free.
  //
  // The window is derived from the centre, so without this every couple of
  // pixels of drag produced a different one — a different query key, a
  // different request, and another multi-megabyte field retained in cache. A
  // single drag could mint hundreds. Snapping to 64 km means a pan reuses the
  // window it already has until it leaves the lattice cell, and the 1.5×
  // margin covers the edges while the next one loads.
  const a = snapDown(row - Math.floor(spanRows / 2));
  const b = snapUp(row + Math.ceil(spanRows / 2));
  const c = snapDown(col - Math.floor(spanCols / 2));
  const d = snapUp(col + Math.ceil(spanCols / 2));

  const row0 = clamp(a, 0, NY - 1);
  const col0 = clamp(c, 0, NX - 1);
  const rows = clamp(b - row0, 1, NY - row0);
  const cols = clamp(d - col0, 1, NX - col0);

  // Frames trimmed so the request cannot exceed what the proxy will serve.
  // Snapping rounds OUTWARD on both edges, so a window can grow by up to two
  // snap steps per axis — which is exactly how a national view went from
  // 1157x628 to 1216x704 and started coming back 400. The client should never
  // send something the server is going to refuse.
  const frames = clamp(Math.floor(MAX_CELLS / Math.max(1, rows * cols)), 1, NFRAMES);

  return { row0, col0, rows, cols, stride: 1, frames };
}

/** 32 km. Big enough that ordinary panning rarely crosses one, small enough
 *  that snapping outward does not inflate the window much. */
const SNAP = 32;

/** Kept under the proxy's own ceiling, with room for the snap to round up. */
const MAX_CELLS = 19_000_000;
const snapDown = (v: number) => Math.floor(v / SNAP) * SNAP;
const snapUp = (v: number) => Math.ceil(v / SNAP) * SNAP;

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

/**
 * The field, as soon as there is any of it, then all of it.
 *
 * WHY. Measured on a cold store, a national request for 24 frames took 9.4
 * seconds — MET has to be asked for every frame, and the map sat empty for all
 * of it. But the FIRST frame is the only one needed to draw anything, and it is
 * a twenty-fourth of the work.
 *
 * THIS USED TO BE TWO REQUESTS: a `frames=1` still to paint immediately, then
 * the full run behind it, the second gated on the first because fired together
 * they competed for fetch slots and the one frame somebody was waiting to look
 * at queued behind twenty-three they were not. It worked — 9.4 s to 0.48 s —
 * but it was a workaround for a response that could not begin until it was
 * finished.
 *
 * Now `/field` streams frame by frame, so ONE request does what two did and
 * does it better: frame 0 paints as soon as it lands, every frame after it
 * arrives without a second round trip, and there is no duplicated frame 0, no
 * gating, and no window where the two queries could disagree. What is left here
 * is the reporting — how much of the run is in — and cancelling superseded
 * windows.
 */
/** Identifies a window, so superseded ones can be told apart and cancelled. */
function planKey(p: ReturnType<typeof planWindow>): string {
  return `${p.row0}:${p.col0}:${p.rows}:${p.cols}`;
}

function keyOf(k: readonly unknown[]): string {
  return `${k[1]}:${k[2]}:${k[3]}:${k[4]}`;
}

/** How many frames this window can actually carry. */
function plannedFrames(req: FieldRequest | null): number {
  return req ? planWindow(req).frames : NFRAMES;
}

export function useProgressiveField(req: FieldRequest | null) {
  const client = useQueryClient();
  const plan = req ? planWindow(req) : null;
  const run = useRadarField(req, plannedFrames(req));

  // Abandon whatever the last window was still downloading.
  //
  // React Query does NOT do this for you. When the key changes the old query
  // merely loses its observer — its request runs to completion and lands in a
  // cache nobody will read. Verified in the browser: zero of eight superseded
  // requests aborted on their own. For a national field that is up to a
  // megabyte of someone else's bandwidth, and a fetch slot on the proxy, spent
  // on a view the reader has already panned away from.
  const key = plan ? planKey(plan) : null;
  useEffect(() => {
    if (!key) return;
    void client.cancelQueries({
      queryKey: ["radar-field"],
      predicate: (q) => q.queryKey[1] !== undefined && keyOf(q.queryKey) !== key,
    });
  }, [key, client]);

  const field = run.data;
  return {
    // `placeholderData` keeps the previous window on screen through a pan, so
    // this never blanks between views.
    field,
    /**
     * More frames are still coming.
     *
     * Read off the payload rather than off the query's status: a field is
     * short either because the stream is open or because the run was truncated
     * upstream, and to everything downstream — the caption, the playback
     * control, the loop that stops at the end — those are the same situation.
     */
    partial: !!field && field.frames < field.expected,
    loading: run.isPending,
    isError: run.isError,
  };
}
