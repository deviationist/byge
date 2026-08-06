/**
 * The two band symbols the whole radar pipeline turns on.
 *
 * This file used to carry a whole wire format — a header, a decoder, a stream
 * reader — for `/field`, which served the rectangle under the viewport. That
 * endpoint is gone: a rectangle cannot express "everything except the middle of
 * my screen", so every pan and zoom refetched cells already in memory. Tiles
 * replaced it (see lib/tileStore and lib/tileFormat), and what survives here is
 * the part that was never about the wire at all.
 *
 * These two values are the app's central distinction in its smallest form.
 * Every layer has to agree on them: the Go quantiser that writes them, the
 * store that fills a missing tile, and the fragment shaders that refuse to
 * blend across the boundary. A test pins each of those against these constants,
 * because the failure mode is silent — an off-by-one into "dry" paints the open
 * Atlantic as looked-at and rainless.
 */

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
