import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { DX, DY, unproject, X0, Y0 } from "../lib/grid";
import { BANDS } from "../lib/scale";
import { MISSING_TILE, TILE, type TileId, tileStore } from "../lib/tileStore";
import type { Theme } from "../theme/useTheme";
import { lonLatToPx } from "./MapCanvas";

/**
 * The radar field on the GPU, drawn tile by tile.
 *
 * WHY NOT ONE TEXTURE. The cells now live in a tile store rather than in one
 * contiguous field, because that is what lets a pan or a zoom fetch only the
 * squares it does not already hold. Stitching them back into a single texture
 * per view would undo the saving in memory instead of bandwidth — a national
 * viewport is ~50 MB of cells, copied again on every window change — so the
 * renderer takes the tiles as they are. Each is one small mesh and one 16 KB
 * texture, and ~40 draw calls is nothing a GPU notices.
 *
 * TWO TEXTURES PER TILE, because the playhead is fractional and consecutive
 * frames are cross-faded. Advancing one frame recycles the texture ahead as the
 * texture behind, so a step costs one upload per tile rather than two.
 *
 * IT REFUSES TO BLEND ACROSS THE COVERAGE BOUNDARY, exactly as the single-field
 * renderer did: half-way between "unobserved" and "light rain" is a colour that
 * asserts an observation we do not have, and it would be drawn along every
 * radar edge in the country for the whole of every transition.
 *
 * A TILE THAT IS NOT LOADED DRAWS AS UNOBSERVED, never as dry — but in practice
 * it is not drawn at all, because the screen only animates as far as every
 * visible tile can go. See `TileStore.depth`.
 */
export type RadarTilesGLProps = {
  tiles: TileId[];
  /** Bumped whenever the store changes, so this repaints. */
  version: number;
  /** Fractional playhead. 3.4 is 40 % of the way from frame 3 to frame 4. */
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
  // Vertices are ABSOLUTE world pixels and the viewport offset is a uniform, so
  // panning costs one vec2 rather than rewriting every buffer.
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
  return int(texture(s, uv).r * 255.0 + 0.5);
}

void main() {
  int ba = bandAt(u_a, v_uv);
  int bb = bandAt(u_b, v_uv);
  vec4 ca = u_palette[ba];
  vec4 cb = u_palette[bb];
  // Never across the coverage boundary — see the note above the component.
  outColor = (ba == NO_COVERAGE || bb == NO_COVERAGE)
    ? (u_t < 0.5 ? ca : cb)
    : mix(ca, cb, u_t);
}`;

/**
 * How much of a step is spent cross-fading.
 *
 * A CROSS-FADE IS THE WRONG TECHNIQUE FOR THIS DATA and this narrows the damage
 * rather than pretending otherwise. Frames are five minutes apart; a band moving
 * 50 km/h travels four whole cells between them, and alpha-blending two fields
 * displaced by four cells does not read as motion — it reads as the band being
 * faintly in two places at once. Held at 50/50 for the middle of every step,
 * that ghost is what the eye actually tracks.
 *
 * So the blend is compressed into the last quarter of each step: three quarters
 * of the time exactly one frame is on screen, and the change happens quickly
 * enough to read as a change rather than as a dissolve. It is a mitigation. The
 * real answer is to ADVECT frame A toward B along MET's own
 * `rev_u_displacement`/`rev_v_displacement`, which ship in the same file and are
 * how the nowcast moves the field in the first place.
 */
const BLEND_WINDOW = 0.25;

function blend(t: number): number {
  const x = (t - (1 - BLEND_WINDOW)) / BLEND_WINDOW;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Smoothstep, so the short fade has no visible corners at either end.
  return x * x * (3 - 2 * x);
}

/**
 * A vertex every MESH_STEP cells. The mesh carries only the PROJECTION WARP,
 * which is smooth — LCC and Mercator differ by a slow rotation, and over eight
 * kilometres the discrepancy is far below a pixel. Per-cell accuracy lives in
 * the texture, still sampled NEAREST at full resolution.
 */
const MESH_STEP = 8;

export function RadarTilesGL({
  tiles,
  version,
  frame,
  originX,
  originY,
  zoom,
  width,
  height,
  theme,
  opacity = 0.82,
}: RadarTilesGLProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GLState | null>(null);

  // ONE MESH PER LATTICE POSITION PER ZOOM, and that is the quiet win of a fixed
  // lattice: a tile's geometry does not depend on the viewport at all, so panning
  // reprojects nothing and a tile seen again at the same zoom reuses its mesh.
  const meshes = useMemo(() => {
    const m = new Map<string, Mesh>();
    for (const t of tiles) m.set(`${t.row}.${t.col}`, buildTileMesh(t, zoom));
    return m;
  }, [tiles, zoom]);

  // `version` looks superfluous to the linter and is the entire repaint signal.
  // The cells are read from the tile store — a module singleton — so nothing
  // else in the dependency list changes when a tile arrives; the counter is what
  // says one did. Without it the map freezes on whatever was in the store at
  // first paint.
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the store's change signal
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

    const ia = Math.max(0, Math.floor(frame));
    const t = blend(frame - ia);

    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook — the rule matches on the `use` prefix alone.
    gl.useProgram(s.program);
    gl.uniform2f(s.uResolution, canvas.width, canvas.height);
    gl.uniform2f(s.uOrigin, originX, originY);
    gl.uniform1f(s.uDpr, dpr);
    gl.uniform1f(s.uT, t);
    gl.uniform4fv(s.uPalette, palette(theme));
    gl.uniform1i(s.uA, 0);
    gl.uniform1i(s.uB, 1);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(s.vao);

    const live = new Set<string>();
    for (const tile of tiles) {
      const key = `${tile.row}.${tile.col}`;
      live.add(key);
      const mesh = meshes.get(key);
      if (!mesh) continue;

      const slot = ensureSlot(gl, s, key);
      // A tile the store has evicted or not yet received paints as unobserved
      // rather than as dry. In practice the screen never animates into this
      // state — see TileStore.depth — but "we could not look" is the only safe
      // thing to say about a square we do not have.
      const a = tileStore.get(tile, ia) ?? MISSING_TILE;
      // The frame ahead, or NOTHING — never a silent fallback to `a`.
      //
      // It used to fall back, and that was the "back and forth": the slot then
      // recorded frameB = ia + 1 while texB actually held frame ia's cells, so
      // one step later the recycle path swapped that texture into A and trusted
      // the label. The map showed the previous frame, every other step.
      const ahead = tileStore.get(tile, ia + 1);

      // With no frame ahead there is nothing to fade toward, so both samplers
      // read the same cells and `u_t` blends A with A — a still, which is the
      // honest picture of "this is the last frame we hold".
      const b = ahead ?? a;
      const bIndex = ahead ? ia + 1 : ia;

      // Recycle on advance: the frame that was ahead becomes the frame behind.
      // Guarded on the DATA as well as the index, so a slot whose B was a
      // stand-in can never be promoted as if it were the real next frame.
      if (slot.frameB === ia && slot.frameA !== ia && slot.dataB) {
        const spare = slot.texA;
        slot.texA = slot.texB;
        slot.texB = spare;
        slot.frameA = slot.frameB;
        slot.frameB = -1;
        slot.dataA = slot.dataB;
        slot.dataB = null;
      }
      if (slot.frameA !== ia || slot.dataA !== a) {
        upload(gl, slot.texA, a);
        slot.frameA = ia;
        slot.dataA = a;
      }
      if (slot.frameB !== bIndex || slot.dataB !== b) {
        upload(gl, slot.texB, b);
        slot.frameB = bIndex;
        slot.dataB = b;
      }

      if (slot.mesh !== mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, slot.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.xy, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, slot.uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        slot.mesh = mesh;
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, slot.texA);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, slot.texB);

      gl.bindBuffer(gl.ARRAY_BUFFER, slot.posBuf);
      gl.vertexAttribPointer(s.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, slot.uvBuf);
      gl.vertexAttribPointer(s.aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.idxBuf);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
    }

    // GPU resources for tiles that have left the viewport. Browsers cap live
    // textures, and a long session of panning would otherwise leak one pair per
    // square of the country ever visited.
    for (const [key, slot] of s.slots) {
      if (live.has(key)) continue;
      releaseSlot(gl, slot);
      s.slots.delete(key);
    }
  }, [tiles, meshes, version, frame, originX, originY, width, height, theme]);

  // Browsers cap how many WebGL contexts can be live at once — around sixteen —
  // and dropping one without releasing it leaks until the tab refuses to make
  // another. Navigating in and out of the map is exactly that loop.
  useEffect(() => {
    return () => {
      const s = glRef.current;
      if (!s) return;
      for (const slot of s.slots.values()) releaseSlot(s.gl, slot);
      s.slots.clear();
      s.gl.deleteVertexArray(s.vao);
      s.gl.deleteProgram(s.program);
      s.gl.getExtension("WEBGL_lose_context")?.loseContext();
      glRef.current = null;
    };
  }, []);

  return (
    <View
      testID="radar-tiles-gl"
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity }}
    >
      <canvas ref={canvasRef} style={{ width, height, display: "block" }} />
    </View>
  );
}

type Mesh = { xy: Float32Array; uv: Float32Array; indices: Uint32Array };

type Slot = {
  mesh: Mesh | null;
  posBuf: WebGLBuffer;
  uvBuf: WebGLBuffer;
  idxBuf: WebGLBuffer;
  texA: WebGLTexture;
  texB: WebGLTexture;
  frameA: number;
  frameB: number;
  // The exact array uploaded, so a tile whose cells ARRIVED since the last draw
  // is re-uploaded even though its frame index has not changed.
  dataA: Uint8Array | null;
  dataB: Uint8Array | null;
};

type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  aPos: number;
  aUv: number;
  slots: Map<string, Slot>;
  uResolution: WebGLUniformLocation | null;
  uOrigin: WebGLUniformLocation | null;
  uDpr: WebGLUniformLocation | null;
  uA: WebGLUniformLocation | null;
  uB: WebGLUniformLocation | null;
  uT: WebGLUniformLocation | null;
  uPalette: WebGLUniformLocation | null;
};

function ensureSlot(gl: WebGL2RenderingContext, s: GLState, key: string): Slot {
  const found = s.slots.get(key);
  if (found) return found;
  const slot: Slot = {
    mesh: null,
    posBuf: gl.createBuffer() as WebGLBuffer,
    uvBuf: gl.createBuffer() as WebGLBuffer,
    idxBuf: gl.createBuffer() as WebGLBuffer,
    texA: newTexture(gl),
    texB: newTexture(gl),
    frameA: -1,
    frameB: -1,
    dataA: null,
    dataB: null,
  };
  s.slots.set(key, slot);
  return slot;
}

function releaseSlot(gl: WebGL2RenderingContext, slot: Slot) {
  gl.deleteBuffer(slot.posBuf);
  gl.deleteBuffer(slot.uvBuf);
  gl.deleteBuffer(slot.idxBuf);
  gl.deleteTexture(slot.texA);
  gl.deleteTexture(slot.texB);
}

function newTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture() as WebGLTexture;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // NEAREST is correctness, not speed. Linear would blend rain into an
  // unobserved cell and invent a drizzle along every coverage boundary.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // CLAMP so a tile's edge texel is not wrapped from the far side, which would
  // draw a stripe of the wrong weather along every tile seam.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function upload(gl: WebGL2RenderingContext, tex: WebGLTexture, cells: Uint8Array) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TILE, TILE, 0, gl.RED, gl.UNSIGNED_BYTE, cells);
}

/**
 * One tile's geometry: grid vertices projected exactly from LCC to Mercator.
 *
 * Depends only on the tile's position in the lattice and the zoom — never on
 * the viewport, never on the frame. That is what makes a fixed lattice cheap to
 * draw as well as cheap to cache.
 */
function buildTileMesh(t: TileId, zoom: number): Mesh {
  const n = Math.ceil(TILE / MESH_STEP);
  const xy = new Float32Array(2 * (n + 1) * (n + 1));
  const uv = new Float32Array(2 * (n + 1) * (n + 1));
  const row0 = t.row * TILE;
  const col0 = t.col * TILE;

  for (let i = 0; i <= n; i++) {
    const cell = Math.min(i * MESH_STEP, TILE);
    for (let j = 0; j <= n; j++) {
      const col = Math.min(j * MESH_STEP, TILE);
      // -0.5 because a cell's stated position is its CENTRE, and the mesh wants
      // its corner. Dropping it draws the whole country half a kilometre off.
      const mx = X0 + (col0 + col - 0.5) * DX;
      const my = Y0 + (row0 + cell - 0.5) * DY;
      const { lat, lon } = unproject(mx, my);
      const p = lonLatToPx({ lat, lon }, zoom);
      const k = 2 * (i * (n + 1) + j);
      xy[k] = p.x;
      xy[k + 1] = p.y;
      uv[k] = col / TILE;
      uv[k + 1] = cell / TILE;
    }
  }

  const indices = new Uint32Array(n * n * 6);
  let m = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      indices[m++] = a;
      indices[m++] = b;
      indices[m++] = c;
      indices[m++] = b;
      indices[m++] = d;
      indices[m++] = c;
    }
  }
  return { xy, uv, indices };
}

/**
 * Eight RGBA colours, indexed by band, ready for a `vec4[8]` uniform.
 *
 * Kept beside the renderer rather than in lib/scale, because the PACKING only
 * means anything to a shader: straight alpha, dry fully transparent so the
 * basemap shows through, unobserved a flat wash. `scale.ts` remains the source
 * of the colours themselves; this is only how they are handed to the GPU.
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

function init(canvas: HTMLCanvasElement): GLState | null {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: true });
  if (!gl) return null;
  const program = link(gl, VERT, FRAG);
  if (!program) return null;
  const vao = gl.createVertexArray();
  if (!vao) return null;

  gl.bindVertexArray(vao);
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aUv = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aUv);

  return {
    gl,
    program,
    vao,
    aPos,
    aUv,
    slots: new Map(),
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
