// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readTileStream } from "./tileFormat";
import { TILE } from "./tileStore";

/**
 * The tiled payload is FRAME-MAJOR: every tile of frame 0, then every tile of
 * frame 1. So a complete picture of now arrives first and the run gains time
 * depth after it. These pin that order, because getting it backwards would
 * still decode cleanly and would deliver a two-hour animation of one corner.
 */

const MAGIC = "BYGETIL2";
const PER = TILE * TILE;
const head = (n: number) => MAGIC.length + 2 + 2 + 2 + 2 + n * 8;

function payload(frames: number, tiles: [number, number][], level = 0): Uint8Array {
  const bytes = new Uint8Array(head(tiles.length) + frames * tiles.length * PER);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  let p = MAGIC.length;
  view.setUint16(p, frames);
  view.setUint16(p + 2, TILE);
  view.setUint16(p + 4, level);
  view.setUint16(p + 6, tiles.length);
  p += 8;
  for (const [r, c] of tiles) {
    view.setInt32(p, r);
    view.setInt32(p + 4, c);
    p += 8;
  }
  // Each tile-frame is filled with its own ordinal, so a transposed or shifted
  // read is immediately visible rather than merely wrong.
  for (let i = 0; i < frames * tiles.length; i++) {
    bytes.fill(i % 200, head(tiles.length) + i * PER, head(tiles.length) + (i + 1) * PER);
  }
  return bytes;
}

function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
}

describe("readTileStream", () => {
  it("yields frame-major: every tile of now before any tile of later", () => {
    // Reversed, this would still decode — and would hand the reader a full
    // animation of one square and nothing anywhere else.
    const tiles: [number, number][] = [
      [1, 1],
      [1, 2],
    ];
    return (async () => {
      const seen: string[] = [];
      for await (const t of readTileStream(stream([payload(2, tiles)]))) {
        seen.push(`f${t.frame}@${t.tile.row}.${t.tile.col}`);
      }
      expect(seen).toEqual(["f0@1.1", "f0@1.2", "f1@1.1", "f1@1.2"]);
    })();
  });

  it("carries the cells that belong to each tile-frame", async () => {
    const got: number[] = [];
    for await (const t of readTileStream(
      stream([
        payload(2, [
          [3, 3],
          [3, 4],
        ]),
      ]),
    )) {
      got.push(t.cells[0]);
      expect(t.cells.length).toBe(PER);
    }
    expect(got).toEqual([0, 1, 2, 3]);
  });

  it("yields nothing for a chunk that does not finish a tile", async () => {
    // Half a tile is not a picture. Drawn, it shows a square with its bottom
    // missing — and against a no-coverage fill that reads as a hole in the
    // radar rather than as a hole in our download.
    const b = payload(1, [[0, 0]]);
    const cut = head(1) + PER - 1;
    const counts: number[] = [];
    for await (const _ of readTileStream(stream([b.subarray(0, cut), b.subarray(cut)]))) {
      counts.push(1);
    }
    expect(counts).toHaveLength(1);
  });

  it("waits for the header rather than guessing at it", async () => {
    const b = payload(1, [[7, 2]]);
    const seen: string[] = [];
    for await (const t of readTileStream(
      stream([b.subarray(0, 5), b.subarray(5, head(1) - 2), b.subarray(head(1) - 2)]),
    )) {
      seen.push(`${t.tile.row}.${t.tile.col}`);
    }
    expect(seen).toEqual(["7.2"]);
  });

  it("refuses a payload that is not one", async () => {
    const html = new TextEncoder().encode("<!doctype html><title>502</title>aaaaaaaaaaaaaaaa");
    await expect(async () => {
      for await (const _ of readTileStream(stream([html]))) {
        // nothing should be yielded
      }
    }).rejects.toThrow(/not a byge tile/);
  });

  it("refuses a server that disagrees about the tile size", async () => {
    // The lattice is the shared object. A different size would have this tab
    // caching squares nothing else agrees about, and every later request would
    // miss — silently, and forever.
    const b = payload(1, [[0, 0]]);
    new DataView(b.buffer).setUint16(MAGIC.length + 2, TILE * 2);
    await expect(async () => {
      for await (const _ of readTileStream(stream([b]))) {
        // nothing should be yielded
      }
    }).rejects.toThrow(/tile size/);
  });

  it("stamps every tile with the level the SERVER sent", () => {
    // Not the level that was asked for. The handler clamps, so a client asking
    // for a level this deployment does not cut gets a coarser tile back; filed
    // under the fine key it would be drawn at a quarter of the ground it
    // covers, leaving gaps between the squares.
    return (async () => {
      for await (const t of readTileStream(stream([payload(1, [[1, 1]], 2)]))) {
        expect(t.tile.level).toBe(2);
      }
    })();
  });
});
