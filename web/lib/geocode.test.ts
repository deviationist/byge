import { afterEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "./geocode";

/**
 * The rule this file protects: a place name is a courtesy, so every failure
 * mode ends in nothing rather than in a placeholder. "Unknown" under a place
 * you named yourself is the app reporting a failure you did not ask about.
 */

const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body } as unknown as Response),
  );

afterEach(() => vi.unstubAllGlobals());

describe("reverseGeocode", () => {
  it("reads the neighbourhood and the city", async () => {
    respond({ address: { suburb: "Grünerløkka", city: "Oslo" } });
    expect(await reverseGeocode(59.9273, 10.7607)).toBe("Grünerløkka, Oslo");
  });

  it("never repeats a name", async () => {
    // In a city the local and wide fields often agree. "Oslo, Oslo" is worse
    // than "Oslo" — it reads as a bug, because it is one.
    respond({ address: { city: "Oslo", municipality: "Oslo" } });
    expect(await reverseGeocode(59.9, 10.7)).toBe("Oslo");
  });

  it("falls back through narrower names before wider ones", async () => {
    respond({ address: { village: "Sokna", county: "Buskerud" } });
    expect(await reverseGeocode(60.2, 9.9)).toBe("Sokna, Buskerud");
  });

  it("returns nothing when the coordinate has no name", async () => {
    // Out at sea. There is no honest answer, so there is no line.
    respond({ address: {} });
    expect(await reverseGeocode(62.0, 2.0)).toBeNull();
  });

  it("returns nothing when the address is missing entirely", async () => {
    respond({});
    expect(await reverseGeocode(62.0, 2.0)).toBeNull();
  });

  it("returns nothing rather than throwing when the request fails", async () => {
    // Rate-limited or refused. A rejected promise here would take down the
    // save path for a field nothing depends on.
    respond({}, false);
    expect(await reverseGeocode(59.9, 10.7)).toBeNull();
  });

  it("returns nothing when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await reverseGeocode(59.9, 10.7)).toBeNull();
  });

  it("sends a coordinate and nothing else", async () => {
    // The zoom used to be sent from here, which meant the precision of the
    // lookup was a client-side decision — and zoom 16+ returns house numbers,
    // so anyone could have turned a context line into a street address. It now
    // lives on the server; this asserts the client no longer has an opinion,
    // and no longer names a destination at all.
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", spy);
    await reverseGeocode(59.9, 10.7);

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/geocode?");
    expect(url).toContain("lat=59.9");
    expect(url).toContain("lon=10.7");
    expect(url).not.toContain("zoom");
    expect(url).not.toContain("nominatim");
  });
});
