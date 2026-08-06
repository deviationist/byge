import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "./search";

/**
 * Search is one of three ways into a coordinate — the map and the coordinate
 * boxes are the others — so every failure here ends in an empty list. It must
 * never throw, never block, and never be the reason a place cannot be added.
 */

const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body } as unknown as Response),
  );

const hit = (over: Record<string, unknown> = {}) => ({
  skrivemåte: "Grünerløkka",
  navneobjekttype: "Administrativ bydel",
  kommuner: [{ kommunenavn: "Oslo" }],
  representasjonspunkt: { nord: 59.9201, øst: 10.7574 },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("searchPlaces", () => {
  it("returns a name and a coordinate", async () => {
    respond({ navn: [hit()] });
    const [p] = await searchPlaces("Grünerløkka");
    expect(p.name).toBe("Grünerløkka");
    expect(p.lat).toBeCloseTo(59.9201);
    expect(p.lon).toBeCloseTo(10.7574);
  });

  it("says what kind of thing and where, so two Sandnes can be told apart", async () => {
    // Picking the wrong one yields a confident, correct-looking answer about
    // the wrong end of the country.
    respond({ navn: [hit()] });
    const [p] = await searchPlaces("Grünerløkka");
    expect(p.detail).toBe("Administrativ bydel · Oslo");
  });

  it("does not search on a single character", async () => {
    // One letter matches most of the country, and it is never what was meant.
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await searchPlaces("G")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores a hit with no coordinate rather than placing it at null island", async () => {
    // A missing representasjonspunkt would become 0,0 — a real coordinate, in
    // the Atlantic, that the app would happily fetch radar for.
    respond({ navn: [hit({ representasjonspunkt: undefined }), hit()] });
    expect(await searchPlaces("Grünerløkka")).toHaveLength(1);
  });

  it("copes with a hit that has no municipality", async () => {
    respond({ navn: [hit({ kommuner: undefined })] });
    const [p] = await searchPlaces("Grünerløkka");
    expect(p.detail).toBe("Administrativ bydel");
  });

  it("returns an empty list when the request fails", async () => {
    respond({}, false);
    expect(await searchPlaces("Bergen")).toEqual([]);
  });

  it("returns an empty list when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await searchPlaces("Bergen")).toEqual([]);
  });

  it("returns an empty list when the body has no results at all", async () => {
    respond({});
    expect(await searchPlaces("Bergen")).toEqual([]);
  });
});
