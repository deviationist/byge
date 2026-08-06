import { type ReactNode, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MONO } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";
import { type KartverketLayer, TileLayer } from "./TileLayer";

/**
 * The map primitive. ONE component behind BOTH map surfaces:
 *
 *   MapField  — the MVP add-a-place picker (centre-pinned, pan to set)
 *   RadarMap  — phase 2 (precipitation overlay, basemap switcher, legend)
 *
 * ─── SWAPPING IN MAPLIBRE ────────────────────────────────────────────────────
 *
 * The real basemap will be MapLibre GL JS. It is deliberately NOT a dependency
 * yet, so what ships here is a *placeholder surface*: a neutral graticule that
 * pans. It is functionally correct — dragging moves the world, the centre is
 * recomputed in Web Mercator and reported — it simply has no tiles under it.
 *
 * Everything MapLibre-shaped is confined to this file. To swap it in:
 *
 *   1. `bun add maplibre-gl` (see the note on the projection below).
 *   2. Replace the <View> tree at the bottom with a container div + `new
 *      maplibregl.Map({ container, center: [lon, lat], zoom, style })`.
 *   3. Delete the pointer/keyboard/wheel effect — MapLibre has its own — and
 *      forward its `move` / `moveend` / `zoomend` events to the same callbacks.
 *   4. Point BASEMAP at real style URLs instead of flat token colours.
 *
 * Nothing outside this file should change, because nothing outside this file
 * knows how panning is implemented. The contract callers depend on is: a
 * controlled `center`, a `zoom`, `onMove`/`onMoveEnd` reporting lat/lon, and
 * children rendered centred over the surface.
 *
 * The projection maths below is Web Mercator *on purpose* — it is what MapLibre
 * uses, so the placeholder and the real thing agree on what a pixel is worth.
 * Note it uses the WGS84 equatorial radius, NOT `PROJ.R` from lib/grid.ts.
 * Those are two different projections doing two different jobs: LCC is the
 * radar grid, Mercator is the viewport. Do not "fix" one to match the other.
 */

export type LatLon = { lat: number; lon: number };

/**
 * The basemaps Kartverket serves without an agreement, verified live.
 *
 * `satellite` was here and is gone: aerial imagery lives in Norge i bilder,
 * which needs a registered agreement rather than being open, and the open cache
 * 400s for ortofoto/flyfoto/satellitt. A switcher option that cannot load is
 * worse than one that is absent.
 */
export type Basemap = KartverketLayer;

/**
 * The viewport an overlay must align to: the top-left corner in absolute Web
 * Mercator world pixels, and the INTEGER zoom those pixels belong to. Integer
 * because tiles only exist at whole zooms — an overlay drawn at the fractional
 * one would drift against the map under it.
 */
export type MapViewport = {
  originX: number;
  originY: number;
  z: number;
  width: number;
  height: number;
};

export type MapCanvasProps = {
  /** Controlled — the parent owns the centre, this reports where it wants to go. */
  center: LatLon;
  zoom: number;
  /** Fires continuously during a drag. MapField's readout needs the live value. */
  onMove?: (center: LatLon) => void;
  /** Fires once the gesture settles. */
  onMoveEnd?: (center: LatLon) => void;
  onZoomChange?: (zoom: number) => void;
  basemap?: Basemap;
  theme: Theme;
  /** RadarMap in a non-interactive placement (e.g. a thumbnail) turns this off. */
  interactive?: boolean;
  /** Accessible name — a bare map surface is meaningless without one. */
  label?: string;
  /**
   * Drawn between the tiles and the chrome, with the viewport the tiles were
   * chosen with. See the note at the call site.
   */
  overlay?: (viewport: MapViewport) => ReactNode;
  /** Basemap credit. Required by most tile providers, so it is a first-class prop. */
  attribution?: string;
  /** Overlays — markers, rings, legends. Rendered centred over the surface. */
  children?: ReactNode;
};

const TILE = 256;

/** Mercator cannot represent the poles; this is where the projection is cut. */
export const MAX_LAT = 85.05112878;

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 16;

/** WGS84 equatorial radius — the Web Mercator one. See the note above. */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;

const RAD = Math.PI / 180;

function worldSize(zoom: number): number {
  return TILE * 2 ** zoom;
}

export function clampLat(lat: number): number {
  return Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
}

/** Normalise into (-180, 180] so a drag across the antimeridian stays sane. */
export function wrapLon(lon: number): number {
  const x = (((lon + 180) % 360) + 360) % 360;
  return x === 0 ? 180 : x - 180;
}

/** lat/lon -> absolute pixel position in the Mercator world at `zoom`. */
export function lonLatToPx(c: LatLon, zoom: number): { x: number; y: number } {
  const w = worldSize(zoom);
  const s = Math.sin(clampLat(c.lat) * RAD);
  return {
    x: ((c.lon + 180) / 360) * w,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w,
  };
}

/** The inverse. */
export function pxToLonLat(x: number, y: number, zoom: number): LatLon {
  const w = worldSize(zoom);
  const n = Math.PI * (1 - (2 * y) / w);
  return {
    lat: Math.atan(Math.sinh(n)) / RAD,
    lon: wrapLon((x / w) * 360 - 180),
  };
}

/**
 * Ground metres per screen pixel. Exported because overlays that are sized in
 * real-world units — MapField's radius ring, RadarMap's coverage mask — have to
 * ask the projection rather than guess. MapLibre answers the same question with
 * `map.unproject`; keeping it here means the ring's maths does not move on swap.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos(clampLat(lat) * RAD)) / worldSize(zoom);
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Placeholder basemaps. Flat token colours, no tiles.
 *
 * They stay LIGHT in dark mode on purpose: MET renders the radar imagery light,
 * and faking a dark basemap under light data misreports the data. The design
 * calls for the map pane to read as a lit window — dark chrome around it, the
 * imagery left as the imagery.
 */
const BASEMAP: Record<Basemap, string> = {
  grey: "#e9e6e0",
  topo: "#eef0e8",
  detailed: "#f0ece2",
  nautical: "#dfe8ee",
};

/** Pixels panned per arrow-key press. Shift multiplies it. */
const KEY_STEP = 48;
const GRATICULE = 52;

export function MapCanvas({
  center,
  zoom,
  onMove,
  onMoveEnd,
  onZoomChange,
  basemap = "grey",
  theme,
  interactive = true,
  label = "Map",
  attribution,
  children,
  overlay,
}: MapCanvasProps) {
  const surfaceRef = useRef<View | null>(null);

  // Every handler below reads the *current* props through this ref, so the DOM
  // listeners can be attached once and never re-bound mid-gesture.
  const live = useRef({ center, zoom, onMove, onMoveEnd, onZoomChange, interactive });
  useEffect(() => {
    live.current = { center, zoom, onMove, onMoveEnd, onZoomChange, interactive };
  });

  const drag = useRef<{ ox: number; oy: number; cx: number; cy: number; zoom: number } | null>(
    null,
  );
  const last = useRef<LatLon | null>(null);

  useEffect(() => {
    const el = surfaceRef.current as unknown as HTMLElement | null;
    if (!el || typeof document === "undefined") return;

    const emit = (next: LatLon, end: boolean) => {
      last.current = next;
      live.current.onMove?.(next);
      if (end) live.current.onMoveEnd?.(next);
    };

    const onDown = (e: PointerEvent) => {
      if (!live.current.interactive || e.button !== 0) return;
      // A press that began on an overlay control is not a pan.
      //
      // The listener is on the surface, so a pointerdown anywhere inside it —
      // including on a button drawn on top — bubbles to here. Starting a drag
      // then does more than pan: `setPointerCapture` below redirects every
      // later pointer event to the surface, so the button never receives its
      // pointerup and NO CLICK IS EVER FIRED. The zoom buttons depressed and
      // did nothing while the map slid underneath them.
      //
      // The surface owns the gesture, so the surface decides what is not one.
      // Any control that sits over the map opts out by marking itself, which
      // also covers whatever phase 2 hangs here — a scrubber, a layer picker.
      if ((e.target as Element | null)?.closest?.("[data-map-control]")) return;
      const { center: c, zoom: z } = live.current;
      const p = lonLatToPx(c, z);
      // Anchor to the centre as it was at press time and derive every later
      // position from that anchor. Stepping from the PREVIOUS centre instead
      // would fold the parent's 4-decimal clamp back into the gesture, and the
      // map would visibly drift away from the finger over a long drag.
      drag.current = { ox: p.x, oy: p.y, cx: e.clientX, cy: e.clientY, zoom: z };
      // jsdom has no pointer capture, and neither do older Safaris.
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onMovePointer = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // Drag right => the world goes right => the viewport centre moves WEST.
      emit(pxToLonLat(d.ox - (e.clientX - d.cx), d.oy - (e.clientY - d.cy), d.zoom), false);
    };

    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      if (last.current) live.current.onMoveEnd?.(last.current);
      last.current = null;
    };

    // A map that can only be panned by dragging is unusable by keyboard, which
    // is the same failure as a menu with no Escape. Arrows move the VIEW (right
    // = look east), which is the opposite sense to dragging the world.
    const onKey = (e: KeyboardEvent) => {
      const L = live.current;
      if (!L.interactive) return;
      const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        L.onZoomChange?.(clampZoom(L.zoom + 1));
        return;
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        L.onZoomChange?.(clampZoom(L.zoom - 1));
        return;
      } else return;
      e.preventDefault();
      const p = lonLatToPx(L.center, L.zoom);
      emit(pxToLonLat(p.x + dx, p.y + dy, L.zoom), true);
    };

    const onWheel = (e: WheelEvent) => {
      const L = live.current;
      if (!L.interactive || !L.onZoomChange) return;
      e.preventDefault();
      L.onZoomChange(clampZoom(L.zoom + (e.deltaY < 0 ? 1 : -1)));
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("keydown", onKey);
    el.addEventListener("wheel", onWheel, { passive: false });
    // Move/up go on the document so a drag that leaves the surface still tracks
    // and, more importantly, still ENDS — otherwise releasing outside the map
    // strands it in a permanent drag.
    document.addEventListener("pointermove", onMovePointer);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointermove", onMovePointer);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Offsetting the graticule by the centre's own pixel position is what makes
  // the surface look panned rather than static. It is also the cheapest honest
  // signal that the placeholder is really moving.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const px = lonLatToPx(center, zoom);
  const offX = -(((px.x % GRATICULE) + GRATICULE) % GRATICULE);
  const offY = -(((px.y % GRATICULE) + GRATICULE) % GRATICULE);

  // Tile indices are integers, so tiles are placed at a ROUNDED zoom while the
  // overlays keep the fractional one. Mixing the two would drift the marker off
  // the map it is pinned to.
  const tileZoom = Math.max(0, Math.min(18, Math.round(zoom)));
  const tilePx = lonLatToPx(center, tileZoom);

  return (
    <View
      ref={surfaceRef}
      role="region"
      aria-label={label}
      aria-roledescription="map"
      tabIndex={interactive ? 0 : -1}
      // The surface is flex-sized, so its pixel dimensions are only knowable
      // after layout — and tiles cannot be chosen without them.
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height },
        );
      }}
      // The basemap stays light in both themes (see BASEMAP). In dark mode that
      // pane needs a harder edge or it floats untethered on the dark chrome —
      // the design frames it as a lit window, and this is the frame.
      className={theme === "dark" ? "border-line2" : "border-line"}
      style={[
        {
          flex: 1,
          minHeight: 240,
          overflow: "hidden",
          backgroundColor: BASEMAP[basemap],
          borderRadius: 12,
          borderWidth: 1,
        },
        interactive ? ({ cursor: "grab", touchAction: "none" } as object) : null,
      ]}
    >
      {size ? (
        <>
          <TileLayer
            layer={basemap}
            z={tileZoom}
            originX={tilePx.x - size.width / 2}
            originY={tilePx.y - size.height / 2}
            width={size.width}
            height={size.height}
          />
          {/*
            Between the basemap and the chrome, which is the design's layer
            order: basemap, then data, then anything unclipped on top.

            A render prop rather than a plain node, because an overlay that has
            to line up with the tiles needs the same viewport the tiles were
            chosen with — the rounded tile zoom, and the origin derived from it.
            Handing it out keeps ONE owner of what a pixel is worth; letting a
            caller recompute it is how a radar field ends up half a tile off the
            coastline it is supposed to sit on.
          */}
          {overlay?.({
            originX: tilePx.x - size.width / 2,
            originY: tilePx.y - size.height / 2,
            z: tileZoom,
            width: size.width,
            height: size.height,
          })}
        </>
      ) : (
        // Before the first layout there is no viewport to cover, so the
        // graticule stands in for one frame. It also survives as the offline
        // face of the map: tiles are a third-party fetch, and a dead grey box
        // with no texture reads as broken rather than as unreachable.
        <View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
            {
              backgroundImage:
                "linear-gradient(90deg,rgba(21,24,27,.10) 1px,transparent 1px)," +
                "linear-gradient(rgba(21,24,27,.10) 1px,transparent 1px)",
              backgroundSize: `${GRATICULE}px ${GRATICULE}px`,
              backgroundPosition: `${offX}px ${offY}px`,
            } as object,
          ]}
        />
      )}

      {/* Overlay plane. Centred, so a child with no positioning of its own lands
          exactly under the map centre — which is what a centre-pinned marker is. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>

      {attribution ? (
        <View
          pointerEvents="none"
          className="bg-surface border-line"
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            borderWidth: 1,
            borderRadius: 6,
            paddingVertical: 3,
            paddingHorizontal: 6,
          }}
        >
          <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 9 }}>
            {attribution}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
