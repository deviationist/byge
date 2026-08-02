// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampRadius,
  DEFAULT_RADIUS_KM,
  loadLocations,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  newId,
  normalise,
  type SavedLocation,
  saveLocations,
} from "./storage";

const loc = (over: Partial<SavedLocation> = {}): SavedLocation => ({
  id: "a",
  name: "Home",
  lat: 59.9273,
  lon: 10.7607,
  radiusKm: 3,
  ...over,
});

beforeEach(() => localStorage.clear());

describe("normalise", () => {
  it("clamps coordinates to 4 decimals — MET 403s above that", () => {
    const n = normalise(loc({ lat: 59.92734567, lon: 10.76071234 }));
    expect(n.lat).toBe(59.9273);
    expect(n.lon).toBe(10.7607);
  });

  it("clamps the radius into range", () => {
    expect(normalise(loc({ radiusKm: 99 })).radiusKm).toBe(MAX_RADIUS_KM);
    expect(normalise(loc({ radiusKm: 0 })).radiusKm).toBe(MIN_RADIUS_KM);
  });

  it("trims the name", () => {
    expect(normalise(loc({ name: "  Cabin  " })).name).toBe("Cabin");
  });
});

describe("clampRadius", () => {
  it("floors at 2 km — our grid is 1 km, so below that buys nothing real", () => {
    expect(clampRadius(1)).toBe(MIN_RADIUS_KM);
  });
  it("caps at 25 km — beyond that the payload gets large for no added answer", () => {
    expect(clampRadius(40)).toBe(MAX_RADIUS_KM);
  });
});

describe("round trip", () => {
  it("persists and reloads", () => {
    saveLocations([loc(), loc({ id: "b", name: "Cabin" })]);
    expect(loadLocations().map((l) => l.name)).toEqual(["Home", "Cabin"]);
  });

  it("returns empty rather than throwing on corrupt storage", () => {
    localStorage.setItem("byge:locations:v1", "{not json");
    expect(loadLocations()).toEqual([]);
  });

  it("drops one malformed entry without losing the rest", () => {
    // Storage is user-writable and survives version changes, so a bad row
    // should cost one place, not the whole list.
    localStorage.setItem(
      "byge:locations:v1",
      JSON.stringify([loc(), { id: "x", name: "broken" }, loc({ id: "c", name: "Work" })]),
    );
    expect(loadLocations().map((l) => l.name)).toEqual(["Home", "Work"]);
  });

  it("supplies a default radius for entries saved before the field existed", () => {
    localStorage.setItem(
      "byge:locations:v1",
      JSON.stringify([{ id: "a", name: "Home", lat: 59.9, lon: 10.7 }]),
    );
    expect(loadLocations()[0].radiusKm).toBe(DEFAULT_RADIUS_KM);
  });
});

describe("newId", () => {
  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
  });
});
