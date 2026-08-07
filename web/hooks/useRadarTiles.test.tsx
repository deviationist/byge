import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TILE, tileStore } from "../lib/tileStore";
import { planTiles, useRadarTiles } from "./useRadarTiles";

/**
 * THE FEATURE, ASSERTED: a tile crosses the wire once.
 *
 * The old map fetched the rectangle on screen, so zooming out refetched the
 * middle of the screen — the part the reader was already looking at. This is
 * the test that would fail if that came back, and it is the reason the tile
 * lattice exists at all.
 */

vi.mock("../lib/opendap", async (orig) => ({
  ...(await orig<typeof import("../lib/opendap")>()),
  latestAnalysis: async () => ({ stamp: "20260806T120000Z", time: new Date() }),
}));

const MAGIC = "BYGETIL2";
const PER = TILE * TILE;
const head = (n: number) => MAGIC.length + 2 + 2 + 2 + 2 + n * 8;

/** A payload answering exactly the tiles a request asked for. */
function respond(tiles: string[], frames: number, level: number): Response {
  const bytes = new Uint8Array(head(tiles.length) + frames * tiles.length * PER);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  let p = MAGIC.length;
  view.setUint16(p, frames);
  view.setUint16(p + 2, TILE);
  view.setUint16(p + 4, level);
  view.setUint16(p + 6, tiles.length);
  p += 8;
  for (const t of tiles) {
    const [r, c] = t.split(".").map(Number);
    view.setInt32(p, r);
    view.setInt32(p + 4, c);
    p += 8;
  }
  return {
    ok: true,
    body: new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(bytes);
        ctrl.close();
      },
    }),
  } as unknown as Response;
}

/** Records what was asked for, and answers it. */
let asked: string[][] = [];
/** The level each of those requests asked for, in step with `asked`. */
let levels: number[] = [];

function Probe({
  zoom,
  width,
  lat = 60.5,
  lon = 9.0,
}: {
  zoom: number;
  width: number;
  lat?: number;
  lon?: number;
}) {
  useRadarTiles({ lat, lon, zoom, width, height: 600 });
  return null;
}

beforeEach(() => {
  asked = [];
  levels = [];
  tileStore.use("reset");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const tiles = decodeURIComponent(new URL(url).searchParams.get("tiles") ?? "").split(",");
      const q = new URL(url).searchParams;
      const frames = Number(q.get("frames"));
      const level = Number(q.get("level") ?? 0);
      asked.push(tiles);
      levels.push(level);
      return respond(tiles, frames, level);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRadarTiles", () => {
  it("fetches the tiles under the viewport", async () => {
    render(<Probe zoom={9} width={800} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].length).toBeGreaterThan(0);
    expect(asked[0][0]).toMatch(/^\d+\.\d+$/);
  });

  it("does NOT refetch what it already holds when the view moves", async () => {
    // The whole point. Pan, and only the ring of new ground should cross the
    // wire — the part of the screen the reader was already looking at is free.
    //
    // PANNING RATHER THAN ZOOMING, since the pyramid landed. Zooming far
    // enough changes the tile LEVEL, and a coarse tile is genuinely different
    // data from the fine ones under it, so refetching there is correct. The
    // guarantee is per level, and a pan is what exercises it.
    const view = render(<Probe zoom={9} width={800} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    const held = new Set(asked[0]);

    await act(async () => {
      view.rerender(<Probe zoom={9} width={800} lat={61.6} />);
    });
    await waitFor(() => expect(asked.length).toBeGreaterThan(1));

    const second = asked[1];
    const refetched = second.filter((t) => held.has(t));
    expect(refetched).toEqual([]);
    // And it did ask for something — otherwise this passes vacuously.
    expect(second.length).toBeGreaterThan(0);
  });

  it("asks for nothing at all when the view moves back", async () => {
    // Panning back lands entirely inside what is already held, so there is no
    // request to make. A cache that still asked would be no cache.
    const view = render(<Probe zoom={9} width={800} lat={61.6} />);
    await waitFor(() => expect(asked).toHaveLength(1));

    await act(async () => {
      view.rerender(<Probe zoom={9} width={800} />);
    });
    await waitFor(() => expect(asked.length).toBeGreaterThan(1));
    const before = asked.length;

    await act(async () => {
      view.rerender(<Probe zoom={9} width={800} lat={61.6} />);
    });
    // Give any request a chance to be made before concluding none was.
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toHaveLength(before);
  });

  it("asks for a coarser level rather than a shorter run when zoomed out", async () => {
    render(<Probe zoom={4} width={1280} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(levels[0]).toBeGreaterThan(0);
  });

  it("does not re-request on a re-render that changes nothing", async () => {
    // The bug this replaced: a fresh plan object per render re-fired the effect,
    // which bumped a version, which re-rendered — 180 requests deep before the
    // rate limiter cut it off.
    const v = render(<Probe zoom={9} width={800} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        v.rerender(<Probe zoom={9} width={800} />);
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toHaveLength(1);
  });
});

describe("planTiles", () => {
  it("keeps the whole run at every zoom, buying area with detail", () => {
    // THE INVERSION THE PYRAMID EXISTS FOR. Frames used to be the budget: pan
    // out over the country and the animation dropped from 24 frames to 12,
    // which is not a smaller picture but a SHORTER FORECAST — and nothing on
    // screen said so. Now the coarser tile pays for the area, and the reader
    // loses resolution they could not see at that zoom anyway.
    for (const zoom of [3, 4, 5, 6, 7, 9, 11, 13]) {
      const p = planTiles({ lat: 60.5, lon: 9, zoom, width: 1280, height: 700 });
      expect(p.frames, `zoom ${zoom}`).toBe(24);
    }
  });

  it("does not coarsen a close view, where the detail is visible", () => {
    // The other half: a level chosen purely by budget would blur the street
    // view too, since it would have no reason not to.
    expect(planTiles({ lat: 60.5, lon: 9, zoom: 11, width: 1280, height: 700 }).level).toBe(0);
    expect(planTiles({ lat: 60.5, lon: 9, zoom: 4, width: 1280, height: 700 }).level).toBeGreaterThan(0);
  });

  it("never cuts finer than one texel per pixel", () => {
    // A 1 km cell drawn into a pixel covering 4 km is three quarters of a
    // download nobody can look at.
    const wide = planTiles({ lat: 60.5, lon: 9, zoom: 5, width: 1280, height: 700 });
    const mpp = (156543.03392 * Math.cos((60.5 * Math.PI) / 180)) / 2 ** 5;
    expect(1 << wide.level).toBeLessThanOrEqual(Math.max(1, mpp / 1000));
  });

  it("covers a viewport with a margin, so a small pan needs no request", () => {
    const p = planTiles({ lat: 60.5, lon: 9, zoom: 9, width: 1280, height: 700 });
    expect(p.tiles.length).toBeGreaterThan(1);
    // Tiles are lattice positions, never cell offsets — the two sides have to
    // agree on what a tile means or nothing caches.
    for (const t of p.tiles) {
      expect(Number.isInteger(t.row)).toBe(true);
      expect(Number.isInteger(t.col)).toBe(true);
    }
  });
});
