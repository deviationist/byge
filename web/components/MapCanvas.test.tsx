import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cellOf } from "../lib/grid";
import {
  clampLat,
  lonLatToPx,
  MAX_LAT,
  MapCanvas,
  metersPerPixel,
  pxToLonLat,
  wrapLon,
} from "./MapCanvas";

const OSLO = { lat: 59.9273, lon: 10.7607 };

function surface(container: HTMLElement) {
  return container.querySelector('[role="region"]') as HTMLElement;
}

/** A drag: press, move, release. Returns nothing — assert on the callbacks. */
function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 150, pointerId: 1, button: 0 });
  fireEvent.pointerMove(document, { clientX: 200 + dx, clientY: 150 + dy, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });
}

describe("Web Mercator projection", () => {
  it("round-trips a coordinate through pixel space", () => {
    for (const zoom of [3, 8, 11, 16]) {
      const p = lonLatToPx(OSLO, zoom);
      const back = pxToLonLat(p.x, p.y, zoom);
      expect(back.lat).toBeCloseTo(OSLO.lat, 9);
      expect(back.lon).toBeCloseTo(OSLO.lon, 9);
    }
  });

  it("doubles the world with each zoom level", () => {
    // If this ever stops holding, every pixel-to-ground conversion in the app
    // is wrong by a power of two.
    const a = lonLatToPx(OSLO, 10);
    const b = lonLatToPx(OSLO, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });

  it("puts north up — higher latitude is a smaller y", () => {
    // The radar grid's Yc DESCENDS (lib/grid.ts), which is the opposite of this.
    // Conflating the two mirrors the field, so the sense is pinned here.
    const north = lonLatToPx({ lat: 70, lon: 15 }, 8);
    const south = lonLatToPx({ lat: 58, lon: 15 }, 8);
    expect(north.y).toBeLessThan(south.y);
  });

  it("clamps latitude at the Mercator cut rather than producing infinity", () => {
    expect(clampLat(89)).toBe(MAX_LAT);
    expect(clampLat(-89)).toBe(-MAX_LAT);
    expect(Number.isFinite(lonLatToPx({ lat: 90, lon: 0 }, 8).y)).toBe(true);
  });

  it("wraps longitude across the antimeridian instead of running off the world", () => {
    expect(wrapLon(190)).toBeCloseTo(-170, 9);
    expect(wrapLon(-190)).toBeCloseTo(170, 9);
    expect(wrapLon(10)).toBeCloseTo(10, 9);
  });

  it("scales metres-per-pixel by latitude and zoom", () => {
    // Mercator stretches away from the equator, so a pixel at 60N covers about
    // half the ground of a pixel at the equator.
    expect(metersPerPixel(0, 10) / metersPerPixel(60, 10)).toBeCloseTo(2, 1);
    expect(metersPerPixel(60, 10) / metersPerPixel(60, 11)).toBeCloseTo(2, 6);
  });

  it("agrees with reality on a known scale", () => {
    // z0 is one 256px tile for the whole world: ~156.5 km per pixel at equator.
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543, 0);
  });
});

describe("MapCanvas panning", () => {
  it("reports a new centre when dragged", () => {
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    drag(surface(container), 100, 0);
    expect(onMove).toHaveBeenCalled();
    const next = onMove.mock.calls.at(-1)?.[0];
    expect(next.lon).not.toBeCloseTo(OSLO.lon, 6);
  });

  it("pans the world, not the viewport — dragging right moves the centre WEST", () => {
    // This is the whole gesture model of a centre-pinned picker. Getting the
    // sign backwards makes the map fight the finger, and it is invisible in a
    // static render.
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    drag(surface(container), 120, 0);
    expect(onMove.mock.calls.at(-1)?.[0].lon).toBeLessThan(OSLO.lon);
  });

  it("dragging down moves the centre NORTH", () => {
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    drag(surface(container), 0, 120);
    expect(onMove.mock.calls.at(-1)?.[0].lat).toBeGreaterThan(OSLO.lat);
  });

  it("moves the centre by exactly the ground distance dragged", () => {
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    drag(surface(container), -256, 0);
    const next = onMove.mock.calls.at(-1)?.[0];
    const expected = 256 * metersPerPixel(OSLO.lat, 11);
    // Convert the reported longitude shift back to metres along the parallel.
    const got = (next.lon - OSLO.lon) * 111_320 * Math.cos((OSLO.lat * Math.PI) / 180);
    expect(got).toBeCloseTo(expected, -1);
  });

  it("fires onMoveEnd once, on release", () => {
    const onMoveEnd = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={onMoveEnd} />,
    );
    const el = surface(container);
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(document, { clientX: 30, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 60, clientY: 0, pointerId: 1 });
    expect(onMoveEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(onMoveEnd).toHaveBeenCalledOnce();
  });

  it("anchors the drag to the press point, so a clamped centre cannot cause drift", () => {
    // The parent clamps to 4 decimals and feeds the value back. If each move
    // stepped from the previous centre, that rounding would accumulate and the
    // map would creep away from the finger. Two moves in one gesture must land
    // where one move of the same total distance lands.
    const stepped = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={stepped} />,
    );
    const el = surface(container);
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(document, { clientX: 50, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 100, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });
    const twoMoves = stepped.mock.calls.at(-1)?.[0];

    const single = vi.fn();
    const { container: c2 } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={single} />,
    );
    drag(surface(c2), 100, 0);
    // `drag` presses at 200,150 — same delta, different origin.
    expect(twoMoves.lon).toBeCloseTo(single.mock.calls.at(-1)?.[0].lon, 12);
  });

  it("ignores moves that never started with a press", () => {
    const onMove = vi.fn();
    render(<MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />);
    fireEvent.pointerMove(document, { clientX: 400, clientY: 400, pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ends a drag released outside the surface", () => {
    // Move/up live on the document precisely so a release off the edge cannot
    // strand the map in a permanent drag.
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    drag(surface(container), 40, 0);
    const after = onMove.mock.calls.length;
    fireEvent.pointerMove(document, { clientX: 900, clientY: 900, pointerId: 1 });
    expect(onMove.mock.calls.length).toBe(after);
  });

  it("does not pan when not interactive", () => {
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" interactive={false} onMove={onMove} />,
    );
    drag(surface(container), 100, 0);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores non-primary buttons", () => {
    const onMove = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMove={onMove} />,
    );
    fireEvent.pointerDown(surface(container), {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      button: 2,
    });
    fireEvent.pointerMove(document, { clientX: 80, clientY: 0, pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("MapCanvas keyboard", () => {
  it("pans with the arrow keys — a drag-only map is unusable by keyboard", () => {
    const onMoveEnd = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={onMoveEnd} />,
    );
    fireEvent.keyDown(surface(container), { key: "ArrowRight" });
    expect(onMoveEnd).toHaveBeenCalledOnce();
    // Arrows move the VIEW, so right looks east — the opposite sense to a drag.
    expect(onMoveEnd.mock.calls[0][0].lon).toBeGreaterThan(OSLO.lon);
  });

  it("ArrowUp looks north", () => {
    const onMoveEnd = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={onMoveEnd} />,
    );
    fireEvent.keyDown(surface(container), { key: "ArrowUp" });
    expect(onMoveEnd.mock.calls[0][0].lat).toBeGreaterThan(OSLO.lat);
  });

  it("shift pans further", () => {
    const plain = vi.fn();
    const { container: a } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={plain} />,
    );
    fireEvent.keyDown(surface(a), { key: "ArrowRight" });
    const fast = vi.fn();
    const { container: b } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={fast} />,
    );
    fireEvent.keyDown(surface(b), { key: "ArrowRight", shiftKey: true });
    expect(fast.mock.calls[0][0].lon - OSLO.lon).toBeGreaterThan(
      plain.mock.calls[0][0].lon - OSLO.lon,
    );
  });

  it("zooms with + and -, clamped to the supported range", () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onZoomChange={onZoomChange} />,
    );
    fireEvent.keyDown(surface(container), { key: "+" });
    expect(onZoomChange).toHaveBeenCalledWith(12);
    fireEvent.keyDown(surface(container), { key: "-" });
    expect(onZoomChange).toHaveBeenCalledWith(10);
  });

  it("zooms on the wheel", () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onZoomChange={onZoomChange} />,
    );
    fireEvent.wheel(surface(container), { deltaY: -100 });
    expect(onZoomChange).toHaveBeenCalledWith(12);
    fireEvent.wheel(surface(container), { deltaY: 100 });
    expect(onZoomChange).toHaveBeenCalledWith(10);
  });

  it("does not zoom past the ends", () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={3} theme="light" onZoomChange={onZoomChange} />,
    );
    fireEvent.keyDown(surface(container), { key: "-" });
    expect(onZoomChange).toHaveBeenCalledWith(3);
  });

  it("is reachable by tab when interactive, and skipped when not", () => {
    const { container: on } = render(<MapCanvas center={OSLO} zoom={11} theme="light" />);
    expect(surface(on).getAttribute("tabindex")).toBe("0");
    const { container: off } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" interactive={false} />,
    );
    expect(surface(off).getAttribute("tabindex")).toBe("-1");
  });
});

describe("MapCanvas rendering", () => {
  it("names itself — a bare map surface announces nothing", () => {
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" label="Pick a place" />,
    );
    expect(surface(container).getAttribute("aria-label")).toBe("Pick a place");
  });

  it("shifts the graticule with the centre, so the surface visibly pans", () => {
    const { container: a } = render(<MapCanvas center={OSLO} zoom={11} theme="light" />);
    const { container: b } = render(
      <MapCanvas center={{ lat: OSLO.lat, lon: OSLO.lon + 0.01 }} zoom={11} theme="light" />,
    );
    const pos = (c: HTMLElement) =>
      (c.querySelectorAll('[role="region"] > div')[0] as HTMLElement).style.backgroundPosition;
    expect(pos(a)).not.toBe(pos(b));
  });

  it("renders overlay children", () => {
    const { getByTestId } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light">
        <div data-testid="overlay" />
      </MapCanvas>,
    );
    expect(getByTestId("overlay")).toBeTruthy();
  });

  it("shows basemap attribution when given one", () => {
    const { getByText } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" attribution="© Kartverket" />,
    );
    expect(getByText("© Kartverket")).toBeTruthy();
  });

  it("keeps the basemap light in dark mode — MET renders the radar light", () => {
    // Faking a dark basemap under light imagery misreports the imagery. The
    // design frames the pane as a lit window instead.
    const { container: light } = render(<MapCanvas center={OSLO} zoom={11} theme="light" />);
    const { container: dark } = render(<MapCanvas center={OSLO} zoom={11} theme="dark" />);
    expect(surface(dark).style.backgroundColor).toBe(surface(light).style.backgroundColor);
  });
});

describe("MapCanvas serves both map surfaces", () => {
  it("pans over the whole radar domain without leaving Mercator", () => {
    // MapField picks places; RadarMap will show the mosaic. Both live inside
    // the LCC grid, so every corner of it has to survive the round trip.
    const corners = [
      { lat: 52, lon: -10 },
      { lat: 73, lon: 41 },
      { lat: 71, lon: -8 },
      { lat: 54, lon: 39 },
    ];
    for (const c of corners) {
      const p = lonLatToPx(c, 6);
      const back = pxToLonLat(p.x, p.y, 6);
      expect(back.lat).toBeCloseTo(c.lat, 8);
      expect(back.lon).toBeCloseTo(c.lon, 8);
    }
  });

  it("resolves finer than a radar cell at picking zoom", () => {
    // A 1 km grid is pointless to pick on if one pixel is worth more than one
    // cell, so this pins that the default picking zoom is actually useful.
    expect(metersPerPixel(60, 11)).toBeLessThan(1000);
  });

  it("a centre reported by a pan is a coordinate the grid layer accepts", () => {
    const onMoveEnd = vi.fn();
    const { container } = render(
      <MapCanvas center={OSLO} zoom={11} theme="light" onMoveEnd={onMoveEnd} />,
    );
    drag(surface(container), 60, 40);
    const c = onMoveEnd.mock.calls.at(-1)?.[0];
    expect(() => cellOf(c.lat, c.lon)).not.toThrow();
  });
});

describe("controls drawn over the map", () => {
  /**
   * The zoom buttons sit inside the surface, so their pointerdown bubbles into
   * the pan listener. That did two things, and the second is the one that bit:
   * it started a drag, and `setPointerCapture` then redirected every later
   * pointer event to the surface — so the button never got its pointerup and no
   * click was ever fired. The buttons depressed and the map slid under them.
   *
   * Note what a `.click()` test proves here: nothing. Calling click() directly
   * dispatches a click and skips hit-testing, capture and bubbling entirely, so
   * the unit tests for ZoomControl passed throughout while the control was
   * unusable in a browser. These press the way a finger does.
   */
  function withControl() {
    const onMove = vi.fn();
    const onZoomChange = vi.fn();
    const view = render(
      <MapCanvas
        center={OSLO}
        zoom={11}
        theme="light"
        onMove={onMove}
        onZoomChange={onZoomChange}
      >
        <button type="button" data-map-control="true" data-testid="overlay-btn">
          +
        </button>
      </MapCanvas>,
    );
    return { ...view, onMove, onZoomChange };
  }

  it("does not pan when the press began on a control", () => {
    const { getByTestId, onMove } = withControl();
    const btn = getByTestId("overlay-btn");
    fireEvent.pointerDown(btn, {
      clientX: 200,
      clientY: 150,
      pointerId: 1,
      button: 0,
      bubbles: true,
    });
    fireEvent.pointerMove(document, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("lets the control receive its own click", () => {
    // The actual symptom. Capture stole the pointerup, so this never fired.
    const { getByTestId } = withControl();
    const btn = getByTestId("overlay-btn");
    const clicked = vi.fn();
    btn.addEventListener("click", clicked);
    fireEvent.pointerDown(btn, {
      clientX: 200,
      clientY: 150,
      pointerId: 1,
      button: 0,
      bubbles: true,
    });
    fireEvent.pointerUp(btn, { pointerId: 1, bubbles: true });
    fireEvent.click(btn);
    expect(clicked).toHaveBeenCalled();
  });

  it("still pans when the press began on the map itself", () => {
    // The guard must not disable the gesture it is protecting.
    const { container, onMove } = withControl();
    drag(surface(container), 100, 0);
    expect(onMove).toHaveBeenCalled();
  });
});

describe("the projection refuses what is not a number", () => {
  /**
   * `Math.min(a, Math.max(b, NaN))` is NaN — a clamp built from min/max does not
   * sanitise its input, it FORWARDS it. That cost a crash in the opacity slider
   * ("NaN is an invalid value for the opacity css style property"), and this is
   * the more dangerous instance of the same trap: `clampLat` feeds `lonLatToPx`,
   * which places every tile and every mesh vertex, and `metersPerPixel`, which
   * sizes every radius ring. One NaN here does not misplace something slightly.
   * It makes the whole map's geometry NaN.
   */
  it("clamps a latitude that is not a latitude", () => {
    expect(clampLat(Number.NaN)).toBe(0);
    expect(clampLat(Number.POSITIVE_INFINITY)).toBe(0);
    // And still clamps ordinary out-of-range values to the Mercator cut.
    expect(clampLat(90)).toBeCloseTo(MAX_LAT, 5);
    expect(clampLat(59.9)).toBe(59.9);
  });

  it("wraps a longitude that is not a longitude", () => {
    expect(wrapLon(Number.NaN)).toBe(0);
    expect(wrapLon(190)).toBe(-170);
  });

  it("never turns a bad coordinate into a NaN pixel", () => {
    const p = lonLatToPx({ lat: Number.NaN, lon: Number.NaN }, 9);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("never returns a NaN scale", () => {
    // Callers DIVIDE by this to size a ring, so NaN would propagate into a
    // width. Infinity is honest for a zoom that is not a number, and yields a
    // ring of zero pixels rather than a crash.
    expect(Number.isNaN(metersPerPixel(Number.NaN, 9))).toBe(false);
    expect(Number.isNaN(metersPerPixel(59.9, Number.NaN))).toBe(false);
    expect(metersPerPixel(59.9, 9)).toBeGreaterThan(0);
  });
});
