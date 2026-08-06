import { describe, expect, it } from "vitest";
import { NFRAMES, NX, NY } from "./grid";
import { analysisFor, apiUrl, clampWindow, frameTimes, OpenDapError, parseAscii } from "./opendap";

/** A verbatim capture of a real thredds.met.no `.ascii` response. */
const REAL = `Dataset {
    Grid {
     ARRAY:
        Float32 lwe_precipitation_rate[time = 3][Yc = 3][Xc = 3];
     MAPS:
        Int32 time[time = 3];
        Float32 Yc[Yc = 3];
        Float32 Xc[Xc = 3];
    } lwe_precipitation_rate;
} radarnowcasting/yrwms-nordic.mos.pcappi-0-rr.nordiclcc-1000.20260801T194000Z.nc;
---------------------------------------------
lwe_precipitation_rate.lwe_precipitation_rate[3][3][3]
[0][0], 0.0, 1.5, 2.0
[0][1], 0.0, 0.0, 0.0
[0][2], 9.96921E36, 0.0, 0.0
[1][0], 0.0, 0.0, 0.0
[1][1], 0.0, 0.0, 0.0
[1][2], 0.0, 0.0, 0.0
[2][0], 0.0, 0.0, 0.0
[2][1], 0.0, 0.0, 0.0
[2][2], 0.0, 0.0, 3.25

lwe_precipitation_rate.time[3]
1785613200, 1785613500, 1785613800

lwe_precipitation_rate.Yc[3]
79000.0, 78000.0, 77000.0

lwe_precipitation_rate.Xc[3]
-254000.0, -253000.0, -252000.0

`;

describe("parseAscii", () => {
  const vars = parseAscii(REAL);

  it("keys variables by their unqualified name", () => {
    // The wire format qualifies grid members as `grid.member`.
    expect([...vars.keys()].sort()).toEqual(["Xc", "Yc", "lwe_precipitation_rate", "time"]);
  });

  it("recovers the declared shape", () => {
    expect(vars.get("lwe_precipitation_rate")!.dims).toEqual([3, 3, 3]);
    expect(vars.get("time")!.dims).toEqual([3]);
  });

  it("strips the [i][j] index prefix rather than reading it as data", () => {
    // This is the whole reason for parsing structurally: a scrape that grabbed
    // every number would swallow the indices as values.
    const v = vars.get("lwe_precipitation_rate")!.values;
    expect(v.length).toBe(27);
    expect(Array.from(v.slice(0, 3))).toEqual([0, 1.5, 2.0]);
    expect(v[26]).toBe(3.25);
  });

  it("preserves _FillValue rather than coercing it to zero", () => {
    // Unobserved cells must stay distinguishable from dry ones all the way up.
    const v = vars.get("lwe_precipitation_rate")!.values;
    expect(v[6]).toBeGreaterThan(1e30);
  });

  it("parses 1-D map vectors that carry no index prefix", () => {
    expect(Array.from(vars.get("time")!.values)).toEqual([1785613200, 1785613500, 1785613800]);
    expect(Array.from(vars.get("Yc")!.values)).toEqual([79000, 78000, 77000]);
  });

  it("does not confuse one variable's values for another's", () => {
    // The spike relied on the data block coming first and truncating by length.
    expect(vars.get("Xc")!.values[0]).toBe(-254000);
    expect(vars.get("lwe_precipitation_rate")!.values[0]).toBe(0);
  });

  it("throws on a body with no data separator", () => {
    expect(() => parseAscii("Error { code = 404; };")).toThrow(OpenDapError);
  });

  it("throws when a block is short of its declared length", () => {
    const truncated = REAL.replace("[2][2], 0.0, 0.0, 3.25", "[2][2], 0.0");
    expect(() => parseAscii(truncated)).toThrow(/expected 27 values, parsed 25/);
  });
});

describe("analysis stamps", () => {
  it("reads a time out of a stamp and carries nothing else", () => {
    const a = analysisFor("20260801T194000Z");
    expect(a.time.toISOString()).toBe("2026-08-01T19:40:00.000Z");
    // The stamp IS the whole handle. If a URL ever reappears on this object,
    // something has started building destinations in the browser again.
    expect(Object.keys(a).sort()).toEqual(["stamp", "time"]);
  });

  it("stamps sort lexicographically in time order", () => {
    // Freshness is compared as strings, which only works because the format is
    // zero-padded and fixed-width — the same property the server's regex relies
    // on to decide a stamp is safe to concatenate.
    const s = ["20260801T235500Z", "20260802T000000Z", "20260802T000500Z"];
    expect([...s].sort()).toEqual(s);
  });
});

describe("apiUrl", () => {
  // Every request in the app is built here, so this is the one place a URL
  // could smuggle its way back into a parameter.
  it("escapes values rather than pasting them in", () => {
    const u = apiUrl("/slab", { stamp: "../../evil?x=1" });
    expect(u).toContain("stamp=..%2F..%2Fevil%3Fx%3D1");
    expect(u.endsWith("/slab?stamp=..%2F..%2Fevil%3Fx%3D1")).toBe(true);
  });

  it("takes numbers without stringifying at the call site", () => {
    expect(apiUrl("/field", { row0: 1400, cols: 7 })).toContain("row0=1400&cols=7");
  });

  it("leaves no trailing ? on a bare path", () => {
    // `/analysis` and `/analysis?` are one request and two cache keys.
    expect(apiUrl("/analysis", {}).endsWith("/analysis")).toBe(true);
  });
});

describe("frameTimes", () => {
  it("derives all 24 frame times from the stamp with no request", () => {
    const t = frameTimes(analysisFor("20260801T194000Z"));
    expect(t).toHaveLength(NFRAMES);
    expect(t[0].toISOString()).toBe("2026-08-01T19:40:00.000Z");
    expect(t[23].toISOString()).toBe("2026-08-01T21:35:00.000Z");
  });
});

describe("clampWindow", () => {
  it("clamps against the north-west corner", () => {
    expect(clampWindow(1, 1, 3)).toEqual({ r0: 0, r1: 4, c0: 0, c1: 4 });
  });

  it("clamps against the south-east corner", () => {
    const w = clampWindow(NY - 2, NX - 2, 3);
    expect(w.r1).toBe(NY - 1);
    expect(w.c1).toBe(NX - 1);
  });

  it("leaves an interior window untouched", () => {
    expect(clampWindow(1000, 500, 3)).toEqual({ r0: 997, r1: 1003, c0: 497, c1: 503 });
  });
});
