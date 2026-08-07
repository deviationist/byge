import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { debugRequested, MapDebug } from "./MapDebug";

/**
 * THE ONE THING THAT MUST NOT REGRESS is that this is off. Everything else here
 * is a debug readout nobody's forecast depends on; a panel that appeared for
 * every reader would be the app showing its own internals over the weather.
 */

function withSearch(search: string) {
  window.history.replaceState({}, "", `/map${search}`);
}

afterEach(() => withSearch(""));

describe("debugRequested", () => {
  it("is off with no query", () => {
    withSearch("");
    expect(debugRequested()).toBe(false);
  });

  it("is off for unrelated parameters", () => {
    withSearch("?lat=60&zoom=8");
    expect(debugRequested()).toBe(false);
  });

  it("is on for a bare ?debug", () => {
    // The form anyone actually types. A truthy `get` check would read "" as
    // false and the flag would look broken.
    withSearch("?debug");
    expect(debugRequested()).toBe(true);
  });

  it("is on for ?debug=1 and off for ?debug=0", () => {
    withSearch("?debug=1");
    expect(debugRequested()).toBe(true);
    withSearch("?debug=0");
    expect(debugRequested()).toBe(false);
  });
});

describe("MapDebug", () => {
  const props = {
    center: { lat: 60.397076, lon: 5.324383 },
    zoom: 8,
    level: 0,
    tiles: 6,
    depth: 24,
    expected: 24,
    width: 1280,
    height: 800,
  };

  it("shows the zoom and the centre to a paste-able precision", () => {
    render(<MapDebug {...props} />);
    expect(screen.getByText("8")).toBeInTheDocument();
    // Six decimals, so it can be pasted into another map and land on the same
    // spot. Rounding to three would move it 50 m.
    expect(screen.getByText("60.397076, 5.324383")).toBeInTheDocument();
  });

  it("states the coarseness in ground units, not just a level number", () => {
    // "level 2" tells you nothing about what you are looking at; "4 km/texel"
    // is the answer to the question that made someone open this.
    render(<MapDebug {...props} level={2} />);
    expect(screen.getByText(/level 2/)).toBeInTheDocument();
    expect(screen.getByText(/4 km\/texel/)).toBeInTheDocument();
  });

  it("does not swallow the gestures it reports on", () => {
    // It sits over the canvas. Eating a drag would break the very pan whose
    // numbers it exists to show.
    render(<MapDebug {...props} />);
    expect(screen.getByTestId("map-debug")).toHaveStyle({ pointerEvents: "none" });
  });
});
