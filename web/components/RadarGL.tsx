import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import type { BandField } from "../lib/fieldFormat";
import { DX, DY, unproject, X0, Y0 } from "../lib/grid";
import { BANDS } from "../lib/scale";
import type { Theme } from "../theme/useTheme";
import { lonLatToPx } from "./MapCanvas";

/**
 * The radar field on the GPU.
 *
 * WHY NOT THE 2D CANVAS that `RadarLayer` uses. That one fills a path per cell,
 * which is fine for the 2 601 cells of a 51×51 window around one saved place.
 * A national view is 200 000+ cells, and 200 000 paths per frame is not a
 * drawing routine, it is a stall. Here the whole field is ONE draw call.
 *
 * THE SHAPE OF IT, and why this is the efficient arrangement rather than just
 * the fashionable one:
 *
 *   geometry   a mesh of (w+1)×(h+1) vertices, each projected EXACTLY from LCC
 *              to Mercator on the CPU. Uploaded once per view. This is what
 *              keeps the field true — see lib/radarGeometry for why an affine
 *              shortcut is not good enough — and the GPU interpolates within a
 *              cell, which is where interpolation is harmless.
 *   data       TWO R8 textures, one texel per cell, sampled NEAREST so a cell is
 *              a flat colour with no bleed between bands. Two because the
 *              playhead is fractional and the shader cross-fades between the
 *              frames either side of it.
 *   palette    eight colours as a uniform array, indexed in the shader.
 *
 * So changing FRAME uploads one small texture and redraws — no geometry work,
 * no per-cell JavaScript. That is what makes playback smooth at national scale:
 * the per-frame cost is a texture the size of the field in bytes, which for the
 * whole country at 4 km sampling is about 220 KB. Advancing by one frame does
 * not even cost that: the texture that was ahead becomes the one behind, so a
 * step is a swap and a single upload.
 *
 * NEAREST sampling is not a performance choice, it is a correctness one. Linear
 * filtering would blend a rain band into an unobserved cell and produce a
 * halfway colour that means nothing — inventing a light drizzle along every
 * coverage boundary in the country.
 */
export type RadarGLProps = {
  field: BandField;
  /**
   * The playhead, and it is FRACTIONAL.
   *
   * 3.4 means "40 % of the way from frame 3 to frame 4", and the shader
   * cross-fades between the two. Radar frames are five minutes apart, so
   * stepping between them is a slideshow — the eye reads it as the weather
   * teleporting rather than moving, which is the opposite of what a forecast
   * animation is for. An integer still works and still snaps; nothing needs to
   * opt in.
   */
  frame: number;
  originX: number;
  originY: number;
  zoom: number;
  width: number;
  height: number;
  theme: Theme;
  opacity?: number;
};

const VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_dpr;
void main() {
  v_uv = a_uv;
  // Vertices arrive in ABSOLUTE world pixels and the viewport offset is a
  // uniform, so panning costs one vec2 rather than rewriting and re-uploading
  // the whole buffer. At national scale that buffer is 1.5 million floats —
  // about 6 MB rebuilt per pointermove, which is most of a frame budget spent
  // producing garbage.
  vec2 screen = (a_pos - u_origin) * u_dpr;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_t;
uniform vec4 u_palette[8];

// Must match NO_COVERAGE in lib/fieldFormat.ts. A test pins the pair.
const int NO_COVERAGE = 7;

int bandAt(sampler2D s, vec2 uv) {
  // R8 texture holds the band index scaled to 0..1 by the sampler.
  return int(texture(s, uv).r * 255.0 + 0.5);
}

void main() {
  int ba = bandAt(u_a, v_uv);
  int bb = bandAt(u_b, v_uv);
  vec4 ca = u_palette[ba];
  vec4 cb = u_palette[bb];

  // NEVER BLEND ACROSS THE COVERAGE BOUNDARY.
  //
  // Cross-fading between two frames is a statement about how the picture moves,
  // not about what was measured — which is fine for rain, and is not fine here.
  // Half-way between "unobserved" and "light rain" is a colour that asserts an
  // observation we do not have, drawn along every radar edge in the country for
  // the whole of every transition. So where either frame is unobserved the cell
  // SNAPS to whichever frame is nearer, and the boundary stays a hard fact.
  outColor = (ba == NO_COVERAGE || bb == NO_COVERAGE)
    ? (u_t < 0.5 ? ca : cb)
    : mix(ca, cb, u_t);
}`;

export function RadarGL({
  field,
  frame,
  originX,
  originY,
  zoom,
  width,
  height,
  theme,
  opacity = 0.82,
}: RadarGLProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GLState | null>(null);

  // Vertices depend on the WINDOW and the ZOOM, never the frame or the bands.
  // This is the whole reason exact per-vertex projection is affordable: a scrub
  // through 24 frames reprojects nothing.
  //
  // Keyed on the window's NUMBERS rather than the field object, which matters
  // now that the field streams: the object identity changes once per frame that
  // arrives, and rebuilding a national mesh two dozen times per window would
  // undo everything MESH_STEP bought.
  const { width: fw, height: fh, row0, col0, stride } = field;
  const mesh = useMemo(
    () => buildMesh({ width: fw, height: fh, row0, col0, stride }, zoom),
    [fw, fh, row0, col0, stride, zoom],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!glRef.current) {
      const created = init(canvas);
      if (!created) return;
      glRef.current = created;
    }
    const s = glRef.current;
    const gl = s.gl;

    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Geometry and texture are re-uploaded only when they actually change.
    // Panning changes neither: it moves the origin uniform, which is why a drag
    // no longer touches a buffer at all.
    if (s.mesh !== mesh) {
      gl.bindBuffer(gl.ARRAY_BUFFER, s.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.xy, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      s.mesh = mesh;
      s.frameA = -1; // the textures belong to the old mesh's dimensions
      s.frameB = -1;
    }

    // The two frames the playhead sits between, and how far between them.
    //
    // Clamped rather than wrapped: the run stops at the horizon, and a playhead
    // on the last frame blends it with itself, which is a still.
    const last = Math.max(0, field.frames - 1);
    const ia = clampIdx(Math.floor(frame), last);
    const ib = clampIdx(ia + 1, last);
    const t = Math.min(1, Math.max(0, frame - Math.floor(frame)));

    const n = field.width * field.height;
    const upload = (tex: WebGLTexture, i: number) => {
      // Explicit unit: the bindings are set for real below, and an upload that
      // silently lands on whichever unit was last active is a debugging trap.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        field.width,
        field.height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        field.bands.subarray(i * n, (i + 1) * n),
      );
    };

    // A NEW FIELD INVALIDATES BOTH, because the bytes behind the same index have
    // changed — which is the normal case while a run streams in.
    if (s.field !== field) {
      s.frameA = -1;
      s.frameB = -1;
      s.field = field;
    }

    // Advancing one frame recycles the texture rather than re-uploading it: the
    // frame that was B is now A. At 60 fps against 5 frames a second that is the
    // difference between two uploads per frame change and one.
    if (s.frameB === ia && s.frameA !== ia) {
      const spare = s.texA;
      s.texA = s.texB;
      s.texB = spare;
      s.frameA = s.frameB;
      s.frameB = -1;
    }
    if (s.frameA !== ia) {
      upload(s.texA, ia);
      s.frameA = ia;
    }
    if (s.frameB !== ib) {
      upload(s.texB, ib);
      s.frameB = ib;
    }

    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook — the rule matches on the `use` prefix alone.
    gl.useProgram(s.program);
    gl.uniform2f(s.uResolution, canvas.width, canvas.height);
    gl.uniform2f(s.uOrigin, originX, originY);
    gl.uniform1f(s.uDpr, dpr);
    gl.uniform1f(s.uT, t);
    gl.uniform4fv(s.uPalette, palette(theme));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.texA);
    gl.uniform1i(s.uA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, s.texB);
    gl.uniform1i(s.uB, 1);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(s.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
  }, [field, frame, mesh, originX, originY, width, height, theme]);

  // Browsers cap how many WebGL contexts can be live at once — around sixteen —
  // and dropping one without releasing it leaks until the tab simply refuses to
  // make another. Navigating in and out of the map is exactly that loop.
  useEffect(() => {
    return () => {
      const s = glRef.current;
      if (!s) return;
      const { gl } = s;
      gl.deleteBuffer(s.posBuf);
      gl.deleteBuffer(s.uvBuf);
      gl.deleteBuffer(s.idxBuf);
      gl.deleteTexture(s.texA);
      gl.deleteTexture(s.texB);
      gl.deleteVertexArray(s.vao);
      gl.deleteProgram(s.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      glRef.current = null;
    };
  }, []);

  return (
    <View
      testID="radar-gl"
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity }}
    >
      <canvas ref={canvasRef} style={{ width, height, display: "block" }} />
    </View>
  );
}

type GLState = {
  gl: WebGL2RenderingContext;
  // What is currently uploaded, so an unchanged pan re-uploads nothing.
  mesh: Mesh | null;
  field: BandField | null;
  // Which frame each texture currently holds; -1 means "nothing usable".
  frameA: number;
  frameB: number;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  uvBuf: WebGLBuffer;
  idxBuf: WebGLBuffer;
  // Two, so consecutive frames can be cross-faded. Swapped on advance.
  texA: WebGLTexture;
  texB: WebGLTexture;
  uResolution: WebGLUniformLocation | null;
  uOrigin: WebGLUniformLocation | null;
  uDpr: WebGLUniformLocation | null;
  uA: WebGLUniformLocation | null;
  uB: WebGLUniformLocation | null;
  uT: WebGLUniformLocation | null;
  uPalette: WebGLUniformLocation | null;
};

function clampIdx(i: number, last: number): number {
  return Math.min(last, Math.max(0, i));
}

function init(canvas: HTMLCanvasElement): GLState | null {
  // `premultipliedAlpha: false` because the palette carries straight alpha —
  // dry is fully transparent and the bands are opaque, and premultiplying would
  // darken the edges where they meet.
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: true });
  if (!gl) return null;

  const program = link(gl, VERT, FRAG);
  if (!program) return null;

  const vao = gl.createVertexArray();
  const posBuf = gl.createBuffer();
  const uvBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();
  const texA = gl.createTexture();
  const texB = gl.createTexture();
  if (!vao || !posBuf || !uvBuf || !idxBuf || !texA || !texB) return null;

  gl.bindVertexArray(vao);
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aUv = gl.getAttribLocation(program, "a_uv");
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

  // NEAREST is correctness, not speed. Linear would blend rain into an
  // unobserved cell and invent a drizzle along every coverage boundary. The
  // cross-fade in the fragment shader is a different thing entirely — it is
  // between two MEASURED frames, and it refuses the same blend across the
  // coverage boundary for the same reason.
  for (const [unit, tex] of [
    [gl.TEXTURE0, texA],
    [gl.TEXTURE1, texB],
  ] as const) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return {
    gl,
    mesh: null,
    field: null,
    frameA: -1,
    frameB: -1,
    program,
    vao,
    posBuf,
    uvBuf,
    idxBuf,
    texA,
    texB,
    uResolution: gl.getUniformLocation(program, "u_resolution"),
    uOrigin: gl.getUniformLocation(program, "u_origin"),
    uDpr: gl.getUniformLocation(program, "u_dpr"),
    uA: gl.getUniformLocation(program, "u_a"),
    uB: gl.getUniformLocation(program, "u_b"),
    uT: gl.getUniformLocation(program, "u_t"),
    uPalette: gl.getUniformLocation(program, "u_palette"),
  };
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/**
 * Grid vertices, projected exactly, plus the triangles and texture coordinates
 * that map one texel to one cell.
 *
 * `stride` is folded in: a strided window's cell covers `stride` grid cells, so
 * the vertex spacing follows. Forgetting it draws a national field compressed
 * into one corner, which looks like a bug in the data rather than in the mesh.
 */
type Mesh = { xy: Float32Array; uv: Float32Array; indices: Uint32Array };

/** Only the window matters here — never the bands. See the memo at the call site. */
type FieldWindow = Pick<BandField, "width" | "height" | "row0" | "col0" | "stride">;

function buildMesh(field: FieldWindow, zoom: number): Mesh {
  const w = field.width;
  const h = field.height;

  // A vertex every MESH_STEP cells, not every cell.
  //
  // This is the difference between a mesh that fits in a megabyte and one that
  // does not fit in memory at all. A national window is 1694x1216 cells; a
  // vertex per corner is 2.1 million of them — 16 MB of positions, 16 MB of
  // texture coordinates and a 49 MB index buffer, 82 MB for ONE mesh, rebuilt
  // whenever the window moves. That is what exhausted the tab.
  //
  // Nothing is lost by coarsening it. The mesh only carries the PROJECTION
  // WARP, which is smooth — LCC and Mercator differ by a slow rotation, and
  // over eight kilometres the discrepancy is far below a pixel. Per-cell
  // accuracy lives in the texture, which is still sampled NEAREST at full
  // resolution. So the picture is identical and the geometry is 64x smaller.
  const cw = Math.max(1, Math.ceil(w / MESH_STEP));
  const ch = Math.max(1, Math.ceil(h / MESH_STEP));

  const xy = new Float32Array(2 * (cw + 1) * (ch + 1));
  const uv = new Float32Array(2 * (cw + 1) * (ch + 1));

  for (let i = 0; i <= ch; i++) {
    // Clamped so the last patch lands exactly on the edge rather than past it,
    // which would stretch the final row of cells off the window.
    const cell = Math.min(i * MESH_STEP, h);
    for (let j = 0; j <= cw; j++) {
      const col = Math.min(j * MESH_STEP, w);
      const mx = X0 + (field.col0 + (col - 0.5) * field.stride) * DX;
      const my = Y0 + (field.row0 + (cell - 0.5) * field.stride) * DY;
      const { lat, lon } = unproject(mx, my);
      const p = lonLatToPx({ lat, lon }, zoom);
      const k = 2 * (i * (cw + 1) + j);
      xy[k] = p.x;
      xy[k + 1] = p.y;
      uv[k] = col / w;
      uv[k + 1] = cell / h;
    }
  }

  const indices = new Uint32Array(cw * ch * 6);
  let n = 0;
  for (let i = 0; i < ch; i++) {
    for (let j = 0; j < cw; j++) {
      const a = i * (cw + 1) + j;
      const b = a + 1;
      const c = a + (cw + 1);
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = d;
      indices[n++] = c;
    }
  }

  return { xy, uv, indices };
}

/**
 * Cells per mesh vertex.
 *
 * Eight keeps a national mesh near a megabyte while leaving the projection
 * error far under a pixel. One would be exact and unusable; the texture is
 * where exactness belongs.
 */
const MESH_STEP = 8;

/**
 * Eight RGBA entries indexed by band symbol.
 *
 * Index 0 is observed dry and is fully TRANSPARENT — the basemap is the honest
 * rendering of "we looked and there is nothing", and a wash would read as
 * drizzle. Index 7 is no coverage, drawn as a flat neutral: the hatch that
 * carries it elsewhere cannot survive at national scale, so it takes the
 * `nodata` surface colour instead, and the legend still names it.
 */
function palette(theme: Theme): Float32Array {
  const out = new Float32Array(8 * 4);
  const put = (i: number, hex: string, alpha: number) => {
    const [r, g, b] = rgb(hex);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = alpha;
  };
  put(0, "#000000", 0); // observed dry — the map shows through
  for (const band of BANDS) {
    if (band.index === 0) continue;
    put(band.index, theme === "dark" ? band.dark : band.light, 1);
  }
  // NO_DATA in scale.ts is yr's rendered RGB triple, used for decoding their
  // tiles rather than for painting ours, so the surface tokens are the right
  // source here.
  put(7, theme === "dark" ? "#2A2E31" : "#FFFFFF", 0.55);
  return out;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
