// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bandAt, decodeField, DRY, NO_COVERAGE, readFieldStream } from "./fieldFormat";

/**
 * The wire format, and specifically the part that changed when `/field` began
 * streaming: how many frames you have is a function of the BYTES, never of the
 * count in the header. The header is written before frame 0 is fetched, so it
 * states an intention — and an intention is exactly what a truncated run
 * disproves.
 */

const MAGIC = "BYGEFLD1";
const HEADER = MAGIC.length + 2 + 2 + 2 + 4 + 4 + 2;

/** A payload with `declared` in the header and `present` frames of cells. */
function payload(declared: number, present: number, w = 2, h = 2): Uint8Array {
  const bytes = new Uint8Array(HEADER + present * w * h);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  const p = MAGIC.length;
  view.setUint16(p, declared);
  view.setUint16(p + 2, w);
  view.setUint16(p + 4, h);
  view.setInt32(p + 6, 1400); // row0
  view.setInt32(p + 10, 500); // col0
  view.setUint16(p + 14, 1); // stride
  // Frame f is filled with the band index f, so a decoded frame identifies
  // itself and an off-by-one in the slicing cannot pass.
  for (let f = 0; f < present; f++) {
    bytes.fill(f % 8, HEADER + f * w * h, HEADER + (f + 1) * w * h);
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

describe("decodeField", () => {
  it("reads the window and the frames", () => {
    const f = decodeField(payload(3, 3).buffer as ArrayBuffer);
    expect(f).toMatchObject({ frames: 3, expected: 3, width: 2, height: 2, row0: 1400, col0: 500 });
    expect(bandAt(f, 2, 0, 0)).toBe(2);
  });

  it("keeps the frames it has when the run was cut short", () => {
    // A truncated run is a real state, not a corruption: an upstream frame
    // failed and the stream stopped. Eight good frames are worth more than an
    // exception, and `expected` still says what was intended.
    const f = decodeField(payload(24, 8).buffer as ArrayBuffer);
    expect(f.frames).toBe(8);
    expect(f.expected).toBe(24);
  });

  it("refuses a body with no whole frame in it", () => {
    expect(() => decodeField(payload(24, 0).buffer as ArrayBuffer)).toThrow(/no complete frame/);
  });

  it("refuses something that is not a field", () => {
    // Almost always an error page arriving where binary was expected. Decoding
    // HTML as weather would paint whatever it happened to spell.
    const html = new TextEncoder().encode("<!doctype html><title>502</title>xxxxxxxx");
    expect(() => decodeField(html.buffer as ArrayBuffer)).toThrow(/not a byge field/);
  });
});

describe("readFieldStream", () => {
  it("yields once per newly complete frame", async () => {
    // A frame is 4 cells here. The chunks deliberately do NOT line up with
    // frame boundaries — 5, then 4, then 3 bytes — because the network never
    // does either.
    const b = payload(3, 3);
    const chunks = [
      b.subarray(0, HEADER + 5),
      b.subarray(HEADER + 5, HEADER + 9),
      b.subarray(HEADER + 9),
    ];
    const counts: number[] = [];
    for await (const f of readFieldStream(stream(chunks))) counts.push(f.frames);
    expect(counts).toEqual([1, 2, 3]);
  });

  it("yields nothing for a chunk that does not finish a frame", async () => {
    // A half-written frame is not a picture. Painting one shows a rain band
    // with its bottom half missing.
    const b = payload(2, 2);
    const chunks = [b.subarray(0, HEADER + 2), b.subarray(HEADER + 2)];
    const counts: number[] = [];
    for await (const f of readFieldStream(stream(chunks))) counts.push(f.frames);
    expect(counts).toEqual([2]);
  });

  it("holds the header back until enough bytes have arrived to read it", async () => {
    const b = payload(1, 1);
    const chunks = [b.subarray(0, 4), b.subarray(4, 12), b.subarray(12)];
    const seen: number[] = [];
    for await (const f of readFieldStream(stream(chunks))) seen.push(f.frames);
    expect(seen).toEqual([1]);
  });

  it("hands out views that do not grow under the reader", async () => {
    // Every yielded field is a window into one allocation. A field handed to
    // the renderer at frame 1 must keep describing frame 1 after frame 2 lands,
    // or a component holding it would silently start reading past its own end.
    const b = payload(3, 3);
    const chunks = [b.subarray(0, HEADER + 4), b.subarray(HEADER + 4)];
    const held: { frames: number; len: number }[] = [];
    for await (const f of readFieldStream(stream(chunks))) {
      held.push({ frames: f.frames, len: f.bands.length });
    }
    expect(held).toEqual([
      { frames: 1, len: 4 },
      { frames: 3, len: 12 },
    ]);
  });

  it("throws when the stream ends before a single frame", async () => {
    const b = payload(24, 0);
    await expect(async () => {
      for await (const _ of readFieldStream(stream([b]))) {
        // no frames expected
      }
    }).rejects.toThrow(/no complete frame/);
  });
});

describe("band symbols", () => {
  it("pins the two values the whole format exists to keep apart", () => {
    // DRY is observed-and-nothing-falling; NO_COVERAGE is could-not-look. If
    // these ever collide the map draws dry ground over the ocean.
    expect(DRY).toBe(0);
    expect(NO_COVERAGE).toBe(7);
  });

  it("agrees with the constant compiled into the shader", async () => {
    // RadarGL's fragment shader hardcodes the value, because GLSL has no import
    // — it refuses to cross-fade a cell where either frame is unobserved. A
    // silent drift here would blend rain into the unobserved edge for the whole
    // of every transition, which is the one thing the format forbids.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../components/RadarGL.tsx", import.meta.url), "utf8"),
    );
    expect(src).toContain(`const int NO_COVERAGE = ${NO_COVERAGE};`);
  });
});
