import { beforeEach, describe, expect, it } from "vitest";
import { removeItem, setItem } from "./kv";
import { loadMapView, saveMapView } from "./mapView";

/**
 * The saved viewport is the one value in the app that comes back from storage
 * and is fed straight into the projection — and the projection throws outside
 * its domain. So the interesting cases here are not "does it round-trip" but
 * "what happens when the value is wrong", because the failure mode is a map
 * that will not load at all rather than one that looks odd.
 */
beforeEach(() => {
  removeItem("byge.map.view");
});

const MIN = 3;
const MAX = 16;
const NAMES = ["none", "grey", "topo", "detailed", "nautical"] as const;
const FALLBACK = { basemap: "grey", radar: true, radarOpacity: 0.8 };
const load = () => loadMapView(MIN, MAX, NAMES, FALLBACK);
const view = (over = {}) => ({ lat: 60, lon: 10, zoom: 8, ...FALLBACK, ...over });

describe("saveMapView / loadMapView", () => {
  it("round-trips a view", () => {
    saveMapView(view({ lat: 59.9273, lon: 10.7607, zoom: 9 }));
    expect(load()).toEqual(view({ lat: 59.9273, lon: 10.7607, zoom: 9 }));
  });

  it("stores nothing finer than four decimals", () => {
    // The same precision the app clamps coordinates to everywhere else — about
    // 11 m, far finer than a 1 km radar cell and coarse enough that this is not
    // a precise record of anywhere.
    saveMapView(view({ lat: 59.92734567, lon: 10.76089123, zoom: 9.4 }));
    expect(load()).toEqual(view({ lat: 59.9273, lon: 10.7609, zoom: 9 }));
  });

  it("has no view before one is saved", () => {
    expect(load()).toBeNull();
  });

  it("clamps a zoom the map can no longer render", () => {
    // MIN_ZOOM and MAX_ZOOM are ours to change, and a value saved under the old
    // pair must not survive as one the projection will refuse.
    saveMapView(view({ zoom: 99 }));
    expect(load()?.zoom).toBe(MAX);
    saveMapView(view({ zoom: -5 }));
    expect(load()?.zoom).toBe(MIN);
  });

  it("treats an impossible coordinate as no view at all", () => {
    // Not clamped: a latitude of 200 is not a view that was nudged out of
    // range, it is a value that did not come from this app. Falling back to the
    // default is honest; clamping would invent a position nobody chose.
    for (const bad of [
      { lat: 200, lon: 10, zoom: 8 },
      { lat: 60, lon: 999, zoom: 8 },
      { lat: Number.NaN, lon: 10, zoom: 8 },
      { lat: 60, lon: 10, zoom: Number.POSITIVE_INFINITY },
    ]) {
      saveMapView(view(bad));
      expect(load()).toBeNull();
    }
  });

  it("survives a corrupt or foreign value", () => {
    // A half-written key, a hand edit, or a format from a future version. The
    // map must open on the default rather than fail to open.
    for (const junk of ["", "{", "null", '{"lat":"59.9"}', "[1,2,3]", '"hello"']) {
      setItem("byge.map.view", junk);
      expect(load()).toBeNull();
    }
  });

  it("keeps the layer settings alongside the position", () => {
    // One key, because these are one decision — "how I have this map set up".
    // Split across keys, a partial write leaves a half-restored map, which is
    // worse than none.
    saveMapView(view({ basemap: "nautical", radar: false, radarOpacity: 0.3 }));
    expect(load()).toMatchObject({ basemap: "nautical", radar: false, radarOpacity: 0.3 });
  });

  it("drops a basemap this build no longer has, and keeps the position", () => {
    // A layer name from an older or newer build is stale; the COORDINATES are
    // still perfectly good. Discarding the whole view over one unrecognised
    // field would throw away the part that matters most.
    setItem(
      "byge.map.view",
      JSON.stringify({ lat: 59.9, lon: 10.7, zoom: 9, basemap: "satellite", radar: true, radarOpacity: 0.8 }),
    );
    const v = load();
    expect(v).toMatchObject({ lat: 59.9, lon: 10.7, zoom: 9, basemap: "grey" });
  });

  it("falls back per field rather than all at once", () => {
    setItem("byge.map.view", JSON.stringify({ lat: 60, lon: 10, zoom: 8, radarOpacity: 12 }));
    const v = load();
    expect(v?.radarOpacity).toBe(0.8);
    expect(v?.radar).toBe(true);
    expect(v?.lat).toBe(60);
  });
});
