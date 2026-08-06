/**
 * The compressed radar field, as the proxy sends it.
 *
 * One byte per cell holding a band index — see `api/internal/field` for the
 * measurements that chose this over raw floats and over rendered tiles. The
 * whole Nordic mosaic at 4 km sampling arrives in about 11 KB.
 *
 * The browser decompresses gzip itself via `Content-Encoding`, so nothing here
 * touches compression: by the time these bytes exist they are already the
 * quantised field.
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
  frames: number;
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

export function decodeField(buffer: ArrayBuffer): BandField {
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, MAGIC.length));
  if (magic !== MAGIC) {
    // Almost always an error page arriving where binary was expected. Saying so
    // beats decoding HTML as weather and painting whatever it happens to spell.
    throw new Error("not a byge field payload");
  }

  let p = MAGIC.length;
  const frames = view.getUint16(p);
  const width = view.getUint16(p + 2);
  const height = view.getUint16(p + 4);
  const row0 = view.getInt32(p + 6);
  const col0 = view.getInt32(p + 10);
  const stride = view.getUint16(p + 14);
  p = HEADER_SIZE;

  const want = frames * width * height;
  const bands = new Uint8Array(buffer, p, want);
  if (bands.length !== want) {
    throw new Error(`field: ${bands.length} bytes for a ${frames}×${width}×${height} window`);
  }

  return { frames, width, height, row0, col0, stride, bands };
}

/** Band index at one cell of one frame. */
export function bandAt(f: BandField, frame: number, i: number, j: number): number {
  return f.bands[frame * f.width * f.height + i * f.width + j];
}

/**
 * Grid sampling for a zoom level.
 *
 * A cell is 1 km. There is no point sending four cells for one screen pixel, so
 * the stride follows the scale — and it is free to do so, because MET decompresses
 * a whole frame either way (see the timings in api/internal/field). Coarser than
 * a pixel would be visible as blockiness; finer is bytes nobody can see.
 */
export function strideForZoom(zoom: number, lat: number): number {
  // Metres per pixel at this zoom and latitude, in Web Mercator.
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const kmPerPixel = mpp / 1000;
  // Aim for roughly one sample per 2 px: fine enough that the field reads as
  // continuous, coarse enough that a national view is kilobytes.
  return Math.max(1, Math.min(32, Math.round(kmPerPixel * 2)));
}
