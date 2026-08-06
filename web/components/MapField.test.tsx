import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clampCoord } from "../lib/grid";
import type { LatLon } from "./MapCanvas";
import { insideGrid, MapField } from "./MapField";

const OSLO = { lat: 59.9273, lon: 10.7607 };
/** Well outside the Nordic LCC domain — cellOf throws here. */
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

/** A geolocation stub. jsdom has none, and the global must never be touched. */
function geo(
  impl: (ok: PositionCallback, fail: PositionErrorCallback) => void,
): Pick<Geolocation, "getCurrentPosition"> {
  return { getCurrentPosition: vi.fn(impl) as Geolocation["getCurrentPosition"] };
}

const granted = (lat: number, lon: number) =>
  geo((ok) => ok({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition));

const refused = () =>
  geo((_ok, fail) => fail({ code: 1, message: "denied" } as GeolocationPositionError));

const surface = (c: HTMLElement) => c.querySelector('[role="region"]') as HTMLElement;

function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 150, pointerId: 1, button: 0 });
  fireEvent.pointerMove(document, { clientX: 200 + dx, clientY: 150 + dy, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });
}

function setup(over: Partial<Parameters<typeof MapField>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <MapField value={OSLO} onChange={onChange} radiusKm={3} theme="light" {...over} />,
  );
  return { onChange, ...utils };
}

describe("MapField is centre-pinned", () => {
  it("shows a marker, and it is not draggable", () => {
    // The marker is fixed and the world moves beneath it. If this ever becomes
    // a draggable pin the gesture model has been inverted.
    const { container } = setup();
    const marker = screen.getByLabelText("Selected point");
    expect(marker).toBeTruthy();
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it("updates the coordinate as the map pans", () => {
    const { onChange, container } = setup();
    drag(surface(container), 80, 0);
    expect(onChange).toHaveBeenCalled();
  });

  it("reports live during the drag, not only on release", () => {
    // The readout has to track the map or the user is aiming blind.
    const { onChange, container } = setup();
    fireEvent.pointerDown(surface(container), {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(document, { clientX: 50, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    fireEvent.pointerUp(document, { pointerId: 1 });
  });

  it("shows the coordinate under the crosshair", () => {
    setup();
    expect(screen.getByText(/59\.9273, 10\.7607/)).toBeTruthy();
  });
});

describe("MapField coordinate clamping", () => {
  it("clamps every reported coordinate to 4 decimals", () => {
    // MET returns HTTP 403 above 4 decimals, so an unclamped pan would produce
    // a place that can never be queried.
    const { onChange, container } = setup();
    drag(surface(container), 37, 23);
    for (const [c] of onChange.mock.calls as [LatLon][]) {
      expect(c.lat).toBe(clampCoord(c.lat));
      expect(c.lon).toBe(clampCoord(c.lon));
      expect(c.lat.toString()).toMatch(/^-?\d+(\.\d{1,4})?$/);
    }
  });

  it("clamps the coordinate that comes back from geolocation too", () => {
    // Devices report full float precision; the clamp cannot live only on the
    // pan path or this route bypasses it.
    const { onChange } = setup({ geolocation: granted(59.91273456, 10.76071234) });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(onChange).toHaveBeenCalledWith({ lat: 59.9127, lon: 10.7607 });
  });

  it("explains the 4-decimal limit rather than silently truncating", () => {
    setup();
    expect(screen.getByText(/Four decimals max/)).toBeTruthy();
    expect(screen.getByText(/11 m/)).toBeTruthy();
  });
});

describe("MapField radius ring", () => {
  it("draws a ring at the chosen radius", () => {
    setup({ radiusKm: 3 });
    expect(screen.getByLabelText("3 km radius")).toBeTruthy();
  });

  it("grows the ring with the radius", () => {
    const size = (km: number) => {
      const { unmount } = setup({ radiusKm: km });
      const px = Number.parseFloat(
        (screen.getByLabelText(`${km} km radius`) as HTMLElement).style.width,
      );
      unmount();
      return px;
    };
    expect(size(10)).toBeGreaterThan(size(3));
  });

  it("scales the ring with zoom, so it stays true to the ground", () => {
    // The ring means "this much real world". Drawn at a fixed pixel size it
    // would lie at every zoom but one.
    const size = (zoom: number) => {
      const { unmount } = setup({ radiusKm: 3, zoom });
      const px = Number.parseFloat(
        (screen.getByLabelText("3 km radius") as HTMLElement).style.width,
      );
      unmount();
      return px;
    };
    expect(size(12) / size(11)).toBeCloseTo(2, 1);
  });

  it("is a single ring, not a filled disc", () => {
    // A filled disc reads as "rain here"; this is a selection boundary.
    setup();
    const el = screen.getByLabelText("3 km radius") as HTMLElement;
    // Unfilled via the token class, so there is no inline background to read —
    // assert the class plus an empty inline background, which also catches a
    // literal fill sneaking in beside it.
    expect(el.className).toContain("bg-transparent");
    expect(el.style.backgroundColor).toBe("");
    expect(Number.parseFloat(el.style.borderTopWidth)).toBeGreaterThan(0);
  });
});

describe("MapField 'Use my location'", () => {
  it("never asks for permission on load", () => {
    // The single most important property of this control. Asking on mount is
    // the classic way to get permanently denied before the user knows why.
    const g = granted(60, 10);
    render(
      <MapField value={OSLO} onChange={() => {}} radiusKm={3} theme="light" geolocation={g} />,
    );
    expect(g.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("asks at the moment it is tapped", () => {
    const g = granted(60, 10);
    setup({ geolocation: g });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(g.getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("centres the map on the fix", () => {
    const { onChange } = setup({ geolocation: granted(63.4305, 10.3951) });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(onChange).toHaveBeenCalledWith({ lat: 63.4305, lon: 10.3951 });
  });

  it("is one-shot — it never watches", () => {
    // watchPosition is the phase-3 live-position feature. If it appears here,
    // the wrong feature is being built.
    const g = granted(60, 10) as Partial<Geolocation>;
    g.watchPosition = vi.fn();
    setup({ geolocation: g as Pick<Geolocation, "getCurrentPosition"> });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(g.watchPosition).not.toHaveBeenCalled();
  });

  it("returns to rest after a fix, leaving no 'tracking' state", () => {
    // Anything that lingers here grows into the phase-3 affordance by accident,
    // and the two features must not look alike.
    setup({ geolocation: granted(60, 10) });
    const btn = screen.getByRole("button", { name: "Use my location" });
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Use my location" })).toBeTruthy();
    expect(screen.queryByText(/Finding you/)).toBeNull();
  });

  it("still requires the user to confirm — it saves nothing itself", () => {
    // It behaves exactly like a pan: it moves the centre and stops there.
    const { onChange } = setup({ geolocation: granted(60, 10) });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("shows a pending state while waiting", () => {
    setup({ geolocation: geo(() => {}) });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("button", { name: "Finding you…" })).toBeTruthy();
  });
});

describe("MapField permission denied", () => {
  it("says it is blocked", () => {
    setup({ geolocation: refused() });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/blocked for this site/i)).toBeTruthy();
  });

  it("points at Settings, because on iOS there is no in-app way back", () => {
    setup({ geolocation: refused() });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/Settings/)).toBeTruthy();
    expect(screen.getByText(/iOS/)).toBeTruthy();
  });

  it("offers the routes that still work rather than only apologising", () => {
    // A dead end the user cannot resolve is exactly where copy has to be useful.
    setup({ geolocation: refused() });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/pan the map or type the coordinates/i)).toBeTruthy();
  });

  it("leaves the map usable", () => {
    const { onChange, container } = setup({ geolocation: refused() });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    onChange.mockClear();
    drag(surface(container), 60, 0);
    expect(onChange).toHaveBeenCalled();
  });

  it("distinguishes a refusal from a failure to get a fix", () => {
    // "Blocked" sends you to Settings; "no fix" means try again. Conflating
    // them sends people to Settings to fix a timeout.
    setup({
      geolocation: geo((_ok, fail) =>
        fail({ code: 3, message: "timeout" } as GeolocationPositionError),
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/Could not get a fix/)).toBeTruthy();
    expect(screen.queryByText(/blocked for this site/i)).toBeNull();
  });

  it("handles a device with no geolocation at all", () => {
    setup({ geolocation: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/cannot report a location/i)).toBeTruthy();
  });
});

describe("MapField grid-coverage warning", () => {
  it("warns while panning, BEFORE anything is saved", () => {
    setup({ value: SYDNEY });
    expect(screen.getByText(/Outside the radar grid/)).toBeTruthy();
  });

  it("says the place would give no answer — not a dry one", () => {
    // The project's one rule: never state a forecast more confidently than the
    // data supports. "No coverage" must never be allowed to read as "dry".
    setup({ value: SYDNEY });
    expect(screen.getByText(/not a dry one, none/)).toBeTruthy();
  });

  it("tells the user how to fix it", () => {
    setup({ value: SYDNEY });
    expect(screen.getByText(/Pan the marker back inside the grid/)).toBeTruthy();
  });

  it("stays quiet inside the grid", () => {
    setup({ value: OSLO });
    expect(screen.queryByText(/Outside the radar grid/)).toBeNull();
  });

  it("announces the warning to assistive tech", () => {
    setup({ value: SYDNEY });
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
});

describe("insideGrid", () => {
  it("accepts a coordinate inside the Nordic domain", () => {
    expect(insideGrid(OSLO.lat, OSLO.lon)).toBe(true);
  });

  it("rejects one outside it", () => {
    expect(insideGrid(SYDNEY.lat, SYDNEY.lon)).toBe(false);
  });

  it("is only a domain check, not a radar-visibility check", () => {
    // A North Sea point is inside the grid but the radar sees nothing there.
    // That distinction is `Verdict.blind` and needs a fetch; this must not
    // pretend to answer it.
    expect(insideGrid(57.5, 3.0)).toBe(true);
  });
});
