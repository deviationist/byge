import { TILE, type TileId } from "./tileStore";

/**
 * The tiled payload, as the API streams it.
 *
 * FRAME-MAJOR: every tile of frame 0, then every tile of frame 1. So a complete
 * picture of NOW arrives first and the run gains time depth after it. The
 * reverse would deliver a full two-hour animation of one corner of the screen
 * and nothing anywhere else, which is not a thing anyone can read.
 *
 * The header states how many frames are COMING. What has arrived is arithmetic
 * on the bytes, exactly as in fieldFormat — which is what makes an in-progress
 * stream and a run truncated upstream the same case.
 */

const MAGIC = "BYGETIL2";

export type TileFrame = { frame: number; tile: TileId; cells: Uint8Array };

export type TileStreamHeader = {
  /** Frames the server intends to send. */
  expected: number;
  tileSize: number;
  /** Cells per texel is `1 << level`. Read from the response, never assumed. */
  level: number;
  tiles: TileId[];
};

function headerSize(n: number): number {
  return MAGIC.length + 2 + 2 + 2 + 2 + n * 8;
}

function readHeader(bytes: Uint8Array): TileStreamHeader | null {
  if (bytes.length < headerSize(0)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (magic !== MAGIC) {
    // Almost always an error page arriving where binary was expected. Decoding
    // HTML as weather would paint whatever it happened to spell.
    throw new Error("not a byge tile payload");
  }
  let p = MAGIC.length;
  const expected = view.getUint16(p);
  const tileSize = view.getUint16(p + 2);
  // THE SERVER'S LEVEL, not ours. It clamps what was asked for, so a client
  // that asks for a level this deployment does not cut gets a coarser tile
  // back — and filing that under the fine tile's key would draw a
  // quarter-scale picture over the right rectangle. Every tile below is
  // stamped with this, so the cache key is always what actually arrived.
  const level = view.getUint16(p + 4);
  const count = view.getUint16(p + 6);
  if (bytes.length < headerSize(count)) return null;
  if (tileSize !== TILE) {
    // The lattice is the shared object. A server that changed its tile size
    // would have this tab caching squares nothing else agrees about, and every
    // later request would miss.
    throw new Error(`tile size ${tileSize} does not match the client's ${TILE}`);
  }
  p += 8;
  const tiles: TileId[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({ row: view.getInt32(p), col: view.getInt32(p + 4), level });
    p += 8;
  }
  return { expected, tileSize, level, tiles };
}

/**
 * Read a tiled stream, yielding each tile-frame as it completes.
 *
 * Yields one item per (tile, frame) so the caller can write straight into the
 * store and repaint. Nothing is yielded for a partial tile: half a tile is not a
 * picture, and drawing one would show a square with its bottom missing — which
 * against a NO_COVERAGE fill reads as a hole in the radar's coverage rather
 * than as a hole in our download.
 */
export async function* readTileStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<TileFrame> {
  const reader = body.getReader();
  let head: TileStreamHeader | null = null;
  let buf = new Uint8Array(headerSize(0));
  let len = 0;
  let base = 0;
  let per = 0;
  let done_ = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value?.length) {
        if (len + value.length > buf.length) {
          const grown = new Uint8Array(Math.max(len + value.length, buf.length * 2));
          grown.set(buf.subarray(0, len));
          buf = grown;
        }
        buf.set(value, len);
        len += value.length;
      }

      if (!head) {
        head = readHeader(buf.subarray(0, len));
        if (head) {
          base = headerSize(head.tiles.length);
          per = TILE * TILE;
          // The total is knowable now, so this is the last allocation.
          const sized = new Uint8Array(base + head.expected * head.tiles.length * per);
          sized.set(buf.subarray(0, len));
          buf = sized;
        }
      }

      if (head) {
        const whole = Math.floor((len - base) / per);
        const cap = head.expected * head.tiles.length;
        for (; done_ < Math.min(whole, cap); done_++) {
          yield {
            frame: Math.floor(done_ / head.tiles.length),
            tile: head.tiles[done_ % head.tiles.length],
            cells: buf.subarray(base + done_ * per, base + (done_ + 1) * per),
          };
        }
      }

      if (done) break;
    }
  } finally {
    // An abandoned generator — a pan superseding this request, a component
    // unmounting — must not leave the body open holding a connection.
    await reader.cancel().catch(() => {});
  }

  if (!head) throw new Error("tile stream ended before its header");
}
