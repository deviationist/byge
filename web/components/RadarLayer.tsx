import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { FILL_THRESHOLD } from "../lib/opendap";
import type { RadarGrid } from "../lib/radar";
import { type CellVertices, cellQuad, cellVertices, rateAt } from "../lib/radarGeometry";
import { type Band, bandOf, colorOf } from "../lib/scale";
import { HATCH_PATTERN } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";

/**
 * The radar field, painted over the basemap.
 *
 * CANVAS, NOT VIEWS. A 51×51 window is 2 601 cells, and the whole point of this
 * screen is watching the band move — scrubbing the graph, or playing the two
 * hours through. As DOM nodes that is 2 601 style diffs per frame and it
 * stutters; on a canvas it is one pass of `fill()` calls and the geometry is
 * already computed. It also gets us antialiased quad edges, which matters
 * because the cells are ROTATED (see lib/radarGeometry) and axis-aligned divs
 * could not have drawn them correctly at any speed.
 *
 * WHAT IT REFUSES TO DRAW is as important as what it draws:
 *
 *   no coverage   hatched, never filled. A cell at or above `FILL_THRESHOLD` is
 *                 one the mosaic cannot see, and painting it any shade of the
 *                 rain ramp — including the palest — would state an observation
 *                 we do not have. This is the app's central distinction and it
 *                 is the easiest one to lose in a heatmap.
 *   dry           left transparent, so the map shows through. Band 0 has no
 *                 colour on purpose: "we looked and there is nothing" should
 *                 look like the ground, not like a faint wash that reads as
 *                 drizzle at a glance.
 */
/**
 * What a single cell should be painted as.
 *
 * Extracted from the draw loop so the one decision this layer must never get
 * wrong is testable without a canvas. It is the app's central distinction in
 * miniature: unobserved is not dry, and dry is not a faint rain.
 */
export function cellPaint(rate: number): Band | "blind" | "dry" {
  // NaN-safe by inversion: NaN fails every comparison, so `!(x < t)` catches
  // both the fill value and a NaN, where `x >= t` would let a NaN through as
  // an observation.
  if (!(rate < FILL_THRESHOLD)) return "blind";
  const band = bandOf(rate);
  return band.index === 0 ? "dry" : band;
}

export type RadarLayerProps = {
  grid: RadarGrid;
  /** Which of the 24 frames to paint. */
  frame: number;
  /** Top-left of the viewport in world pixels, and the zoom they belong to. */
  originX: number;
  originY: number;
  zoom: number;
  width: number;
  height: number;
  theme: Theme;
  /**
   * Painted over a basemap that has to stay readable underneath. Below about
   * 0.75 the ramp's own light bands stop being distinguishable from the map.
   */
  opacity?: number;
};

export function RadarLayer({
  grid,
  frame,
  originX,
  originY,
  zoom,
  width,
  height,
  theme,
  opacity = 0.82,
}: RadarLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Vertices depend on the window and the zoom, never on the frame — so a
  // scrub through all 24 frames reprojects nothing. This is what makes the
  // per-vertex accuracy affordable.
  const vertices: CellVertices = useMemo(() => cellVertices(grid, zoom), [grid, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Backing store at device resolution; CSS box stays in layout pixels.
    // Without this the quad edges are visibly soft on any retina screen.
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const hatch = hatchPattern(ctx, theme);

    for (let i = 0; i < grid.height; i++) {
      for (let j = 0; j < grid.width; j++) {
        const paint = cellPaint(rateAt(grid, frame, i, j));
        // Observed dry. Left as the map — see the note above.
        if (paint === "dry") continue;
        const band = paint === "blind" ? null : paint;

        const q = cellQuad(vertices, i, j);
        ctx.beginPath();
        ctx.moveTo(q[0] - originX, q[1] - originY);
        ctx.lineTo(q[2] - originX, q[3] - originY);
        ctx.lineTo(q[4] - originX, q[5] - originY);
        ctx.lineTo(q[6] - originX, q[7] - originY);
        ctx.closePath();

        ctx.fillStyle = band ? colorOf(band, theme) : (hatch ?? "transparent");
        ctx.fill();
      }
    }
    outlineWindow(ctx, vertices, originX, originY);
  }, [grid, frame, vertices, originX, originY, width, height, theme]);

  return (
    <View
      testID="radar-layer"
      // Never eats a drag meant for the map: this is a picture of the data, not
      // a control.
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity }}
    >
      <canvas ref={canvasRef} style={{ width, height, display: "block" }} />
    </View>
  );
}

/**
 * The edge of what we asked for, drawn as a dashed boundary.
 *
 * WITHOUT THIS THE MAP LIES BY OMISSION. The window is a fixed 51×51 km around
 * the place, so the painted field stops at a hard rectangle — and everything
 * beyond it renders as untouched basemap, which is exactly how this layer draws
 * OBSERVED DRY. A band that continues past the corner would appear to end
 * there. That is the same class of mistake as showing "no coverage" as dry, and
 * this screen exists to prevent that class of mistake.
 *
 * A dashed line rather than a fade: a fade reads as rain weakening, which is a
 * meteorological claim. A drawn boundary reads as an edge of the request, which
 * is what it is — and the footnote says so in words.
 */
function outlineWindow(
  ctx: CanvasRenderingContext2D,
  v: CellVertices,
  originX: number,
  originY: number,
) {
  const corner = (i: number, j: number) => {
    const k = 2 * (i * (v.width + 1) + j);
    return [v.xy[k] - originX, v.xy[k + 1] - originY] as const;
  };
  const [ax, ay] = corner(0, 0);
  const [bx, by] = corner(0, v.width);
  const [cx, cy] = corner(v.height, v.width);
  const [dx, dy] = corner(v.height, 0);

  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(128,128,128,.55)";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * The same 45° hatch as `Swatch` and the coverage strip, drawn into a canvas
 * tile instead of a CSS gradient.
 *
 * Built from `HATCH_PATTERN` — the shared numbers — rather than from the
 * gradient string, so the three renderings of "not observed" cannot drift into
 * three different textures.
 */
function hatchPattern(ctx: CanvasRenderingContext2D, theme: Theme): CanvasPattern | null {
  const { period, lineWidth, color } = HATCH_PATTERN;
  const tile = document.createElement("canvas");
  tile.width = period;
  tile.height = period;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  // The unobserved fill sits under the hatch, so the cell reads as a surface
  // with a texture rather than as stripes over the basemap. Dark mode needs a
  // dark base for the same reason the ramp inverts there.
  tctx.fillStyle = theme === "dark" ? "#2A2E31" : "#FFFFFF";
  tctx.fillRect(0, 0, period, period);

  tctx.strokeStyle = color;
  tctx.lineWidth = lineWidth;
  tctx.beginPath();
  tctx.moveTo(-period, period);
  tctx.lineTo(period, -period);
  tctx.moveTo(0, 2 * period);
  tctx.lineTo(2 * period, 0);
  tctx.stroke();

  return ctx.createPattern(tile, "repeat");
}
