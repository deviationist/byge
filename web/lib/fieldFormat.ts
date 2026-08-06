/**
 * The compressed radar field, as the API sends it.
 *
 * One byte per cell holding a band index — see `api/internal/field` for the
 * measurements that chose this over raw floats and over rendered tiles. The
 * whole Nordic mosaic at 4 km sampling arrives in about 11 KB.
 *
 * The browser decompresses gzip itself via `Content-Encoding`, so nothing here
 * touches compression: by the time these bytes exist they are already the
 * quantised field.
 *
 * IT ARRIVES A FRAME AT A TIME. The server writes the header first and then
 * flushes each frame as it fetches it, so the count in the header is what is
 * COMING, not what has come. Everything below therefore derives the usable
 * frame count from the bytes in hand — which makes an in-progress stream and a
 * run truncated by an upstream failure the same case, handled by the same
 * arithmetic, with no special path for either.
 */

const MAGIC = "BYGEFLD1";
const HEADER_SIZE = MAGIC.length + 2 + 2 + 2 + 4 + 4 + 2;

/** Observed, and nothing falling. NOT the same as unobserved. */
export const DRY = 0;
/**
 * The mosaic cannot see this cell.
 *
 * Deliberately 7, above every band, so code that mistakes the byte for an
 * intensity produces an obviously wrong answer rather than a plausible one —
 * an off-by-one into "torrential" is noticed; one into "dry" is not.
 */
export const NO_COVERAGE = 7;

export type BandField = {
  /** Frames actually present in `bands`. Never more than there are bytes for. */
  frames: number;
  /**
   * Frames the server said it intends to send.
   *
   * `frames < expected` means more are still on the wire, or the run was cut
   * short upstream. The map uses it to say the animation is still arriving
   * instead of showing a frame count that is about to change under the reader.
   */
  expected: number;
  width: number;
  height: number;
  /** Top-left cell in MET's grid. */
  row0: number;
  col0: number;
  /** Grid cells between samples. 1 is every cell. */
  stride: number;
  /** `bands[f * width * height + i * width + j]`. */
  bands: Uint8Array;
};

type FieldHeader = Omit<BandField, "frames" | "bands">;

function readHeader(bytes: Uint8Array): FieldHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (magic !== MAGIC) {
    // Almost always an error page arriving where binary was expected. Saying so
    // beats decoding HTML as weather and painting whatever it happens to spell.
    throw new Error("not a byge field payload");
  }
  const p = MAGIC.length;
  return {
    expected: view.getUint16(p),
    width: view.getUint16(p + 2),
    height: view.getUint16(p + 4),
    row0: view.getInt32(p + 6),
    col0: view.getInt32(p + 10),
    stride: view.getUint16(p + 14),
  };
}

/**
 * Decode a complete payload.
 *
 * Tolerates a SHORT body rather than throwing, because short is a real state
 * and not a corruption: the run was truncated at an upstream failure, and eight
 * good frames are worth more than an exception. It refuses only a body with no
 * whole frame in it at all, which is the case where there is genuinely nothing
 * to draw.
 */
export function decodeField(buffer: ArrayBuffer): BandField {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_SIZE) throw new Error("field: truncated header");
  const head = readHeader(bytes);

  const per = head.width * head.height;
  if (per <= 0) throw new Error("field: empty window");
  const frames = Math.min(head.expected, Math.floor((bytes.length - HEADER_SIZE) / per));
  if (frames < 1) throw new Error("field: no complete frame in the payload");

  return { ...head, frames, bands: bytes.subarray(HEADER_SIZE, HEADER_SIZE + frames * per) };
}

/**
 * The same payload, yielded as it arrives.
 *
 * Yields once per NEWLY COMPLETE frame, so a caller gets a drawable field as
 * soon as frame 0 lands and a growing one after that. Nothing is yielded for a
 * chunk that does not finish a frame — a half-written frame is not a picture,
 * and painting one would show a rain band with its bottom half missing.
 *
 * The buffer is allocated ONCE from the header, at the full intended size, and
 * chunks are copied into it. Concatenating on every chunk would be quadratic
 * and would churn a megabyte of garbage per pan; every yielded field is a view
 * into the same allocation, and views already handed out keep their own length
 * so they never see frames that arrived after them.
 */
export async function* readFieldStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<BandField> {
  const reader = body.getReader();
  // Before the header is parsed there is nothing to size an allocation with, so
  // the first few bytes are held in a small growable buffer.
  let head: FieldHeader | null = null;
  let buf = new Uint8Array(HEADER_SIZE);
  let len = 0;
  let per = 0;
  let yielded = 0;

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

      if (!head && len >= HEADER_SIZE) {
        head = readHeader(buf);
        per = head.width * head.height;
        if (per <= 0) throw new Error("field: empty window");
        // Now the total is known, so this is the last allocation.
        const sized = new Uint8Array(HEADER_SIZE + head.expected * per);
        sized.set(buf.subarray(0, len));
        buf = sized;
      }

      if (head) {
        const have = Math.min(head.expected, Math.floor((len - HEADER_SIZE) / per));
        if (have > yielded) {
          yielded = have;
          yield {
            ...head,
            frames: have,
            bands: buf.subarray(HEADER_SIZE, HEADER_SIZE + have * per),
          };
        }
      }

      if (done) break;
    }
  } finally {
    // An abandoned generator — a pan superseding this window, a component
    // unmounting — must not leave the body open holding a connection.
    await reader.cancel().catch(() => {});
  }

  if (!head || yielded < 1) throw new Error("field: no complete frame in the payload");
}

/** Band index at one cell of one frame. */
export function bandAt(f: BandField, frame: number, i: number, j: number): number {
  return f.bands[frame * f.width * f.height + i * f.width + j];
}
