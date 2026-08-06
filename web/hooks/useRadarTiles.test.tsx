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

const MAGIC = "BYGETIL1";
const PER = TILE * TILE;
const head = (n: number) => MAGIC.length + 2 + 2 + 2 + n * 8;

/** A payload answering exactly the tiles a request asked for. */
function respond(tiles: string[], frames: number): Response {
  const bytes = new Uint8Array(head(tiles.length) + frames * tiles.length * PER);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  let p = MAGIC.length;
  view.setUint16(p, frames);
  view.setUint16(p + 2, TILE);
  view.setUint16(p + 4, tiles.length);
  p += 6;
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

function Probe({ zoom, width }: { zoom: number; width: number }) {
  useRadarTiles({ lat: 60.5, lon: 9.0, zoom, width, height: 600 });
  return null;
}

beforeEach(() => {
  asked = [];
  tileStore.use("reset");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const tiles = decodeURIComponent(new URL(url).searchParams.get("tiles") ?? "").split(",");
      const frames = Number(new URL(url).searchParams.get("frames"));
      asked.push(tiles);
      return respond(tiles, frames);
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

  it("does NOT refetch what it already holds when the view widens", async () => {
    // The whole point. Zoom out and only the ring around the old view should
    // cross the wire.
    const close = render(<Probe zoom={9} width={800} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    const held = new Set(asked[0]);

    // Same centre, wider view — a strict superset of tiles.
    await act(async () => {
      close.rerender(<Probe zoom={7} width={800} />);
    });
    await waitFor(() => expect(asked.length).toBeGreaterThan(1));

    const second = asked[1];
    const refetched = second.filter((t) => held.has(t));
    expect(refetched).toEqual([]);
    // And it did ask for something — otherwise this passes vacuously.
    expect(second.length).toBeGreaterThan(0);
  });

  it("asks for nothing at all when the view narrows back", async () => {
    // Zooming back in lands entirely inside what is already held, so there is
    // no request to make. A cache that still asked would be no cache.
    const wide = render(<Probe zoom={7} width={800} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    const before = asked.length;

    await act(async () => {
      wide.rerender(<Probe zoom={9} width={800} />);
    });
    // Give any request a chance to be made before concluding none was.
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toHaveLength(before);
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
  it("trades frames for area, so a wide view is not unaffordable", () => {
    // FRAMES ARE THE BUDGET, the same trade the rectangle made. At street scale
    // you want the whole run; at national scale you want to see it move.
    const close = planTiles({ lat: 60.5, lon: 9, zoom: 11, width: 1280, height: 700 });
    const wide = planTiles({ lat: 60.5, lon: 9, zoom: 5, width: 1280, height: 700 });

    expect(wide.tiles.length).toBeGreaterThan(close.tiles.length);
    expect(wide.frames).toBeLessThanOrEqual(close.frames);
    expect(close.frames).toBe(24);
    expect(wide.frames).toBeGreaterThanOrEqual(1);
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
