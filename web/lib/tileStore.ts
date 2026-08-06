import { NO_COVERAGE } from "./fieldFormat";
import { NX, NY } from "./grid";

/**
 * Every radar cell this tab has already downloaded.
 *
 * WHY THIS EXISTS. The map used to fetch the rectangle it was looking at. Pan a
 * little and it refetched the ninety per cent that had not moved; zoom out and
 * it refetched the middle of the screen entirely, because a rectangle minus its
 * middle is not a rectangle and so there was no way to ask for less. Tens of
 * megabytes of the reader's bandwidth went on cells already in memory.
 *
 * Tiles fix that by making "what am I missing" a set difference. The lattice is
 * fixed and grid-aligned, so a tile means the same 128 km square before and
 * after a zoom, to this tab and to the server. Fetch it once, keep it, and every
 * later view that touches it is free.
 *
 * IT IS KEYED BY ANALYSIS, and that is not a detail. A five-minute-old run and
 * the current one describe the same squares with different weather; sharing a
 * key between them would paint the past. When the stamp changes the old run's
 * tiles are dropped whole — they can never be useful again, and the alternative
 * is a cache that grows by a national mosaic every five minutes.
 *
 * IT HAS A HARD BYTE BUDGET, because unbounded is what crashed this tab once
 * already. Eviction is least-recently-used, which for a map is exactly right:
 * the tiles you are about to want again are the ones you just looked at.
 */

/** Cells per side. MUST match `field.TileSize` on the server — see tiles.go. */
export const TILE = 128;

/** Tile lattice dimensions, from the grid's own size. */
export const TILE_ROWS = Math.ceil(NY / TILE);
export const TILE_COLS = Math.ceil(NX / TILE);

const CELLS = TILE * TILE;

/**
 * How much radar the tab will hold, in bytes.
 *
 * 64 MB is about 4 000 tile-frames — a national viewport across a full 24-frame
 * run, plus room to pan without immediately discarding what you came from. The
 * previous design retained fields for sixty seconds and peaked near 90 MB doing
 * far less; this is a ceiling rather than a hope, so it can be higher and still
 * be safer.
 */
const BUDGET_BYTES = 64 * 1024 * 1024;

export type TileId = { row: number; col: number };

/** `row.col`, matching the wire syntax the API parses. */
export function tileKey(t: TileId): string {
  return `${t.row}.${t.col}`;
}

function cellKey(stamp: string, t: TileId, frame: number): string {
  return `${stamp}/${t.row}.${t.col}/${frame}`;
}

/**
 * A tile of cells that is not here, and must not be mistaken for one that is.
 *
 * Filled with NO_COVERAGE rather than DRY, and rather than left transparent.
 * Both alternatives read as "the radar looked and there was nothing", which is
 * a claim, and the one claim byge must never make by accident. "We could not
 * look" is at least honest about a square we have not downloaded — and in
 * practice the renderer avoids showing it at all by only animating as far as
 * every visible tile can go.
 */
export const MISSING_TILE: Uint8Array = new Uint8Array(CELLS).fill(NO_COVERAGE);

export class TileStore {
  /** Insertion order IS the LRU order: Map preserves it, and a read re-inserts. */
  private cells = new Map<string, Uint8Array>();
  private bytes = 0;
  private stamp: string | null = null;

  constructor(private budget = BUDGET_BYTES) {}

  /**
   * Point the store at an analysis, dropping any other run.
   *
   * Called before anything is read or written for a stamp. A run that is no
   * longer current can never become useful again — the client always follows
   * the newest — so keeping it is pure cost.
   */
  use(stamp: string): void {
    if (this.stamp === stamp) return;
    this.stamp = stamp;
    this.cells.clear();
    this.bytes = 0;
  }

  get analysis(): string | null {
    return this.stamp;
  }

  has(t: TileId, frame: number): boolean {
    return this.stamp !== null && this.cells.has(cellKey(this.stamp, t, frame));
  }

  /** The cells, and a touch that marks them as recently used. */
  get(t: TileId, frame: number): Uint8Array | null {
    if (this.stamp === null) return null;
    const k = cellKey(this.stamp, t, frame);
    const v = this.cells.get(k);
    if (!v) return null;
    // Re-insert so it moves to the young end. This is the whole LRU mechanism.
    this.cells.delete(k);
    this.cells.set(k, v);
    return v;
  }

  put(t: TileId, frame: number, cells: Uint8Array): void {
    if (this.stamp === null) return;
    if (cells.length !== CELLS) {
      throw new Error(`tile is ${cells.length} cells, expected ${CELLS}`);
    }
    const k = cellKey(this.stamp, t, frame);
    const had = this.cells.get(k);
    if (had) this.bytes -= had.length;
    this.cells.set(k, cells);
    this.bytes += cells.length;
    this.evict();
  }

  /**
   * How many frames of this tile set are complete.
   *
   * THE ANIMATION RUNS ONLY AS FAR AS EVERY VISIBLE TILE CAN GO, which is the
   * rule that keeps a ragged cache honest. Zoom in, collect 24 frames of one
   * square, zoom out, and the newly visible squares have fewer — playing past
   * their end would leave holes on screen, and a hole is indistinguishable from
   * observed-dry. So the playable depth is the minimum, and the extra frames of
   * the inner tiles simply wait for the next zoom in.
   */
  depth(tiles: TileId[], limit: number): number {
    if (this.stamp === null || tiles.length === 0) return 0;
    let n = 0;
    while (n < limit && tiles.every((t) => this.has(t, n))) n++;
    return n;
  }

  /** The tiles of `wanted` this store cannot supply for every frame below `frames`. */
  missing(tiles: TileId[], frames: number): TileId[] {
    if (this.stamp === null) return tiles;
    return tiles.filter((t) => {
      for (let f = 0; f < frames; f++) if (!this.has(t, f)) return true;
      return false;
    });
  }

  /** For the tests and for a memory readout: what is actually held. */
  stats(): { entries: number; bytes: number; stamp: string | null } {
    return { entries: this.cells.size, bytes: this.bytes, stamp: this.stamp };
  }

  private evict(): void {
    // Oldest first, which for an insertion-ordered Map is simply the front.
    while (this.bytes > this.budget) {
      const oldest = this.cells.keys().next();
      if (oldest.done) return;
      const v = this.cells.get(oldest.value);
      this.cells.delete(oldest.value);
      this.bytes -= v ? v.length : 0;
    }
  }
}

/**
 * Which tiles cover a viewport.
 *
 * Takes the cell rectangle the viewport spans and returns the lattice squares
 * touching it, clipped to the lattice. Off-lattice squares are dropped rather
 * than clamped: a map panned into the Atlantic covers nothing, and inventing an
 * edge tile for it would put the coastline's data in the ocean.
 */
export function tilesFor(row0: number, col0: number, rows: number, cols: number): TileId[] {
  const r0 = Math.max(0, Math.floor(row0 / TILE));
  const c0 = Math.max(0, Math.floor(col0 / TILE));
  const r1 = Math.min(TILE_ROWS - 1, Math.floor((row0 + rows - 1) / TILE));
  const c1 = Math.min(TILE_COLS - 1, Math.floor((col0 + cols - 1) / TILE));

  const out: TileId[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) out.push({ row: r, col: c });
  }
  return out;
}

/**
 * The store is a MODULE SINGLETON, deliberately.
 *
 * Its whole value is surviving things — a pan, a zoom, leaving the map for a
 * verdict and coming back. Hanging it off a component would throw it away on
 * unmount, which is precisely the moment its contents become most valuable. The
 * analysis stamp bounds its lifetime instead, and the byte budget bounds its
 * size.
 */
export const tileStore = new TileStore();
