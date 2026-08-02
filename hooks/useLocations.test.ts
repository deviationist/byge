import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_RADIUS_KM } from "../lib/storage";
import { useLocations } from "./useLocations";

beforeEach(() => localStorage.clear());

const home = { name: "Home", lat: 59.9273, lon: 10.7607, radiusKm: 3 };
const cabin = { name: "Cabin", lat: 60.862, lon: 8.556, radiusKm: 3 };
const work = { name: "Work", lat: 59.922, lon: 10.679, radiusKm: 3 };

describe("useLocations", () => {
  it("adds, updates and removes", () => {
    const { result } = renderHook(() => useLocations());
    let id = "";
    act(() => {
      id = result.current.add(home).id;
    });
    expect(result.current.locations).toHaveLength(1);

    act(() => result.current.update(id, { name: "House" }));
    expect(result.current.byId(id)?.name).toBe("House");

    act(() => result.current.remove(id));
    expect(result.current.locations).toHaveLength(0);
  });

  it("normalises on the way in", () => {
    const { result } = renderHook(() => useLocations());
    act(() => {
      result.current.add({ ...home, lat: 59.92734567, radiusKm: 99 });
    });
    expect(result.current.locations[0].lat).toBe(59.9273);
    expect(result.current.locations[0].radiusKm).toBe(MAX_RADIUS_KM);
  });

  it("persists across remounts — the list must survive a reload", () => {
    const first = renderHook(() => useLocations());
    act(() => {
      first.result.current.add(home);
    });
    first.unmount();

    const second = renderHook(() => useLocations());
    expect(second.result.current.locations.map((l) => l.name)).toEqual(["Home"]);
  });

  it("loads synchronously so the list never flashes empty", () => {
    // An empty state that appears for one frame reads as "your places are gone".
    const seed = renderHook(() => useLocations());
    act(() => {
      seed.result.current.add(home);
    });
    seed.unmount();

    const { result } = renderHook(() => useLocations());
    expect(result.current.locations).toHaveLength(1); // first render, not after an effect
  });
});

describe("neighbourOf — what the detail pane shows after a delete", () => {
  function seeded() {
    const { result } = renderHook(() => useLocations());
    act(() => {
      result.current.add({ ...home, id: "1" });
      result.current.add({ ...cabin, id: "2" });
      result.current.add({ ...work, id: "3" });
    });
    return result;
  }

  it("selects the item that took the deleted one's place", () => {
    // On two-pane the detail pane was showing the thing just removed, so it
    // needs a real answer rather than a blank.
    expect(seeded().current.neighbourOf("2")?.name).toBe("Work");
  });

  it("falls back to the new last item when the last was deleted", () => {
    expect(seeded().current.neighbourOf("3")?.name).toBe("Cabin");
  });

  it("returns null when the last remaining place is deleted", () => {
    // Which is the signal to show the 'cleared' empty state.
    const { result } = renderHook(() => useLocations());
    act(() => {
      result.current.add({ ...home, id: "1" });
    });
    expect(result.current.neighbourOf("1")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(seeded().current.neighbourOf("nope")).toBeNull();
  });
});
