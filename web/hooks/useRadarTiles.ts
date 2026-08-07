import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cellOf, NFRAMES, NX, NY } from "../lib/grid";
import { apiHeaders, apiUrl, latestAnalysis } from "../lib/opendap";
import { readTileStream } from "../lib/tileFormat";
import { type TileId, tileKey, tileStore, tilesFor } from "../lib/tileStore";

/**
 * The radar under the viewport, fetching only what this tab does not hold.
 *
 * THE DIFFERENCE FROM `useRadarField`, which it replaces for the map: that one
 * asked for the rectangle on screen and got all of it, every time. Panning a
 * little refetched almost everything; zooming out refetched the middle of the
 * screen. This one asks the store what is missing and requests exactly that —
 * so a tile crosses the wire once and every later view that touches it is free.
 *
 * IT DOES NOT USE REACT QUERY, and that is a considered removal rather than an
 * oversight. React Query caches RESPONSES keyed by request; the whole point here
 * is a cache of CELLS that outlives any particular request and is assembled from
 * several. Keeping both would mean two caches with two eviction policies holding
 * the same megabytes, which is how the tab ran out of memory the first time. The
 * store is the cache; this hook is only the loader in front of it.
 *
 * WHAT IT RETURNS is a version counter rather than data. The cells live in the
 * store, the renderer reads them from there, and re-rendering on every one of
 * several hundred tile arrivals would be pointless work — so arrivals are
 * coalesced onto animation frames and the counter is what tells React something
 * changed.
 */

export type TileRequest = {
  lat: number;
  lon: number;
  zoom: number;
  width: number;
  height: number;
};

/**
 * How many tile-frames one view may hold on screen.
 *
 * The same trade `planWindow` made, in the same direction: FRAMES ARE THE
 * BUDGET, so a wide view buys area with time depth and a close view gets the
 * whole run. 3 000 tile-frames is about 49 MB of cells, which the store's own
 * 64 MB budget can hold alongside a little history.
 */
const MAX_TILE_FRAMES = 3000;

/** The API refuses more than this in one request; ask in batches. */
const TILES_PER_REQUEST = 160;

/**
 * The coarsest tile the API will cut. Must match `maxTileLevel` in the Go handler.
 *
 * Level 2 is 4 km per texel and 512 km per tile, which covers the whole 1694 x
 * 2134 km domain in 20 tiles — 480 tile-frames, a sixth of the budget. There is
 * no need for a level 3.
 */
const MAX_LEVEL = 2;

export function useRadarTiles(req: TileRequest | null, maxFrames = NFRAMES) {
  const [version, setVersion] = useState(0);
  const [stamp, setStamp] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Bumped on every arrival, read on an animation frame. Without the coalescing
  // a national first load would re-render React several hundred times in a
  // second, for a canvas that can only paint sixty.
  const dirty = useRef(false);

  // MEMOISED ON THE VIEWPORT NUMBERS, not recomputed per render, and that is
  // load-bearing twice over. A fresh object every render put this effect in an
  // infinite loop — it fetched, bumped the version, re-rendered, and fetched
  // again, 180 requests deep before the rate limiter cut it off. And the
  // renderer memoises its tile meshes on this array, so a new identity would
  // reproject every tile on screen on every frame of playback.
  const planKey = req
    ? `${req.zoom}:${Math.round(req.lat * 1e4)}:${Math.round(req.lon * 1e4)}:${Math.round(req.width)}:${Math.round(req.height)}:${maxFrames}`
    : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: planKey IS req, rounded — see above
  const plan = useMemo(() => (req ? planTiles(req, maxFrames) : null), [planKey]);

  // A stable identity for "the same set of tiles at the same depth", so the
  // effect below does not re-fire on a pan that stays inside the same tiles.
  const planId = plan
    ? `${plan.frames}:${plan.level}:${plan.tiles.map(tileKey).join(",")}`
    : null;

  // Read inside the effect without making its identity a trigger.
  const planRef = useRef(plan);
  planRef.current = plan;

  const touch = useCallback(() => {
    if (dirty.current) return;
    dirty.current = true;
    requestAnimationFrame(() => {
      dirty.current = false;
      setVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    const plan = planRef.current;
    if (!plan || !planId) return;
    const ac = new AbortController();
    let live = true;

    (async () => {
      try {
        const analysis = await latestAnalysis(ac.signal);
        if (!live) return;
        // Dropping a superseded run happens here, once, rather than per tile.
        tileStore.use(analysis.stamp);
        setStamp(analysis.stamp);
        setError(false);
        touch();

        // THE SET DIFFERENCE — the reason this hook exists. Everything already
        // held is skipped, so a zoom out asks only for the ring around what is
        // already on screen.
        const wanted = tileStore.missing(plan.tiles, plan.frames);
        for (let i = 0; i < wanted.length; i += TILES_PER_REQUEST) {
          const batch = wanted.slice(i, i + TILES_PER_REQUEST);
          const res = await fetch(
            apiUrl("/tiles", {
              stamp: analysis.stamp,
              frames: plan.frames,
              level: plan.level,
              tiles: batch.map(tileKey).join(","),
            }),
            { signal: ac.signal, headers: apiHeaders() },
          );
          if (!res.ok) throw new Error(`tiles ${res.status}`);
          if (!res.body) throw new Error("tiles: no stream");

          for await (const t of readTileStream(res.body)) {
            if (!live) return;
            // Copied out of the stream buffer, because the store keeps it and
            // the buffer is one allocation shared by the whole response.
            tileStore.put(t.tile, t.frame, t.cells.slice());
            touch();
          }
        }
      } catch (e) {
        if (!live || ac.signal.aborted) return;
        if ((e as Error)?.name === "AbortError") return;
        setError(true);
      }
    })();

    return () => {
      live = false;
      // Abandon whatever this window was still downloading. The tiles already
      // stored are kept — they are just as good as if the request had finished,
      // which is the other quiet benefit of caching cells rather than responses.
      ac.abort();
    };
    // Deliberately NOT `plan`: `planId` is its content, and depending on the
    // object would re-fire this on every render. See the memo above.
  }, [planId, touch]);

  // How much of the run every visible tile can supply. Read fresh on each
  // render so it tracks arrivals; `version` is what causes those renders.
  const depth = plan ? tileStore.depth(plan.tiles, plan.frames) : 0;

  return {
    stamp,
    tiles: plan?.tiles ?? [],
    /** Frames every visible tile has. The animation must not exceed this. */
    depth,
    /** Frames this view is aiming for. */
    expected: plan?.frames ?? 0,
    /** How coarse the tiles are: cells per texel is `1 << level`. For the debug readout. */
    level: plan?.level ?? 0,
    loading: depth === 0,
    partial: depth > 0 && depth < (plan?.frames ?? 0),
    isError: error,
    version,
  };
}

/**
 * Which tiles a viewport needs, and how deep a run it can afford.
 *
 * Exported for the tests: this is where a wrong number is a silent failure —
 * too few tiles leaves a visible edge of weather mid-screen, too many spends
 * memory nobody looks at.
 */
export function planTiles(
  req: TileRequest,
  /**
   * A ceiling the caller imposes, under whatever the budget allows.
   *
   * The verdict's preview is a STILL — it shows now and nothing else — so it
   * passes 1 and downloads a twenty-fourth of what the map does. It still fills
   * the same store, which is why opening the map from a verdict finds frame 0
   * already there.
   */
  maxFrames = NFRAMES,
): { tiles: TileId[]; frames: number; level: number } {
  const mpp = (156543.03392 * Math.cos((req.lat * Math.PI) / 180)) / 2 ** req.zoom;
  // A margin, so a small pan is covered by tiles already fetched rather than by
  // a new request. Smaller than the old rectangle's 1.5×, because the lattice
  // already rounds outward by up to a tile on each side.
  const cols = Math.ceil((req.width * mpp * 1.2) / 1000);
  const rows = Math.ceil((req.height * mpp * 1.2) / 1000);
  const { row, col } = safeCell(req.lat, req.lon);
  const top = row - Math.floor(rows / 2);
  const left = col - Math.floor(cols / 2);

  // WHICH LEVEL, and why it is chosen in this order.
  //
  // The floor is RESOLUTION: a 1 km cell drawn into a pixel that covers 4 km is
  // three quarters of a download nobody can see, so the tile is never finer than
  // the screen can show. `mpp / 1000` is cells per pixel; a level-L texel is
  // 2^L cells, so log2 of it is the level at which one texel lands on one pixel.
  //
  // From there it coarsens until the WHOLE RUN fits in the budget. That
  // inversion is the entire point of the pyramid: before it, a wide view paid
  // for area in frames — pan out over the country and the animation silently
  // dropped from 24 frames to 12, which is not a smaller picture but a shorter
  // forecast. Area is now bought with detail, which is what the reader was going
  // to lose to their own screen anyway.
  const finest = clamp(Math.floor(Math.log2(Math.max(1, mpp / 1000))), 0, MAX_LEVEL);
  let level = finest;
  let tiles = tilesFor(top, left, rows, cols, level);
  while (level < MAX_LEVEL && tiles.length * maxFrames > MAX_TILE_FRAMES) {
    level++;
    tiles = tilesFor(top, left, rows, cols, level);
  }

  // Still the last resort, for a viewport so large that even level 2 overruns —
  // and for `maxFrames` of 1, where it never binds at all.
  const frames = clamp(Math.floor(MAX_TILE_FRAMES / Math.max(1, tiles.length)), 1, maxFrames);
  return { tiles, frames, level };
}

/**
 * The grid throws outside its domain, and a map can legitimately be panned into
 * the Atlantic. Falling back to the middle keeps the request valid; the lattice
 * clips whatever lands off it.
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
