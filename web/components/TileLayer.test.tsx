import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KARTVERKET_LAYERS, TileLayer, tileUrl, creditFor } from "./TileLayer";

/**
 * Tile arithmetic fails quietly: a wrong index shows a real map of the wrong
 * place, and an unwrapped column shows blank sea. Neither throws.
 */

const grid = (props: Partial<Parameters<typeof TileLayer>[0]> = {}) =>
  render(
    <TileLayer
      originX={0}
      originY={0}
      z={4}
      width={512}
      height={512}
      // The GRID tests use the single-layer case on purpose. A Kartverket layer
      // is stacked over the global base, so its image count is doubled — which
      // says nothing about whether the geometry covers the viewport, and would
      // make every count here a puzzle. Stacking has its own tests below.
      layer="none"
      {...props}
    />,
  ).container.querySelectorAll("img");

describe("tileUrl", () => {
  it("puts the axes in Kartverket's order — {z}/{y}/{x}, not {z}/{x}/{y}", () => {
    // Swapping these yields a valid URL for a real tile somewhere else entirely,
    // so it renders a map rather than an error.
    expect(tileUrl("grey", 10, 545, 290)).toBe(
      "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/10/290/545.png",
    );
  });

  it("maps every basemap to a layer that exists in the open cache", () => {
    // Verified against the live WMTSCapabilities document, which advertises
    // exactly these four and nothing else. A typo here yields a 400 for every
    // tile — a blank map, not an error anyone sees in a log.
    expect(Object.values(KARTVERKET_LAYERS)).toEqual([
      "topograatone",
      "topo",
      "toporaster",
      "sjokartraster",
    ]);
  });

  it("offers no aerial layer, because there is not one to offer", () => {
    // Guards against someone re-adding the design's sketched "satellite" and
    // "hybrid" options. Norge i bilder needs a signed agreement, the old
    // statkart opencache gateway no longer resolves, and WebAtlas answers 403
    // without a key — so those names would render a blank pane, which reads as
    // a broken map rather than an unavailable one.
    const names = Object.values(KARTVERKET_LAYERS).join(" ");
    for (const aerial of ["orto", "foto", "satellitt", "nib"]) {
      expect(names).not.toContain(aerial);
    }
  });
});

describe("coverage", () => {
  it("covers the viewport with no gaps", () => {
    // 512x512 aligned to the origin needs exactly 3x3: the two full tiles plus
    // the partial one the right and bottom edges land in.
    expect(grid({ width: 512, height: 512 }).length).toBe(9);
  });

  it("asks for one tile when the viewport fits inside one", () => {
    expect(grid({ width: 100, height: 100 }).length).toBe(1);
  });

  it("covers a viewport that straddles a tile boundary", () => {
    expect(grid({ originX: 200, originY: 200, width: 100, height: 100 }).length).toBe(4);
  });
});

describe("edges of the world", () => {
  it("wraps columns across the antimeridian rather than running out of map", () => {
    // At z=1 the world is two tiles wide; column 2 is column 0 again.
    const urls = [...grid({ z: 1, originX: 511, originY: 0, width: 2, height: 2 })].map((i) =>
      i.getAttribute("src"),
    );
    expect(urls.some((u) => u?.endsWith("/1/0/0.png"))).toBe(true);
  });

  it("does NOT wrap rows, because there is no map above the pole", () => {
    // Wrapping Y would show the antarctic where the arctic should be — a real
    // map of the wrong hemisphere, which reads as working.
    const imgs = grid({ z: 1, originX: 0, originY: -300, width: 256, height: 256 });
    for (const img of imgs) {
      expect(img.getAttribute("src")).not.toContain("/1/-1/");
    }
  });

  it("draws nothing rather than something wrong when entirely off the world", () => {
    expect(grid({ z: 0, originY: -5000, height: 256, width: 256 }).length).toBe(0);
  });
});

describe("zoom", () => {
  it("uses integer zoom for tile indices", () => {
    // A fractional zoom would ask for tile 5.4 and get nothing back. Checked on
    // the Kartverket layer, whose path carries the zoom in a distinctive place —
    // and on the stack, so the base is asked at the same zoom as the sheet over
    // it. A base one level off would be a subtly misregistered map.
    const urls = [...grid({ z: 6, layer: "grey" })].map((i) => i.getAttribute("src") ?? "");
    const kv = urls.filter((u) => u.includes("kartverket"));
    const base = urls.filter((u) => u.includes("cartocdn"));
    expect(kv.length).toBeGreaterThan(0);
    expect(base.length).toBe(kv.length);
    for (const u of kv) expect(u).toMatch(/webmercator\/6\/\d+\/\d+\.png$/);
    for (const u of base) expect(u).toMatch(/\/6\/\d+\/\d+\.png$/);
  });
});

describe("the basemap that covers the radar", () => {
  /**
   * MET's mosaic reaches Denmark, Sweden, Finland, Germany, the Baltics and
   * St Petersburg. Kartverket stops at the Norwegian border — and it does not
   * stop by failing, it serves an identical 854-byte BLANK tile for every
   * request outside Norway (verified live across nine cities). So the map drew
   * live rain over white nothing for most of its own coverage, and blank ground
   * reads as "the data ended" precisely where the data is fine.
   */
  it("serves the base from a global source", () => {
    const url = tileUrl("base", 5, 17, 9);
    expect(url).toContain("cartocdn");
    expect(url).not.toContain("kartverket");
  });

  it("uses XYZ order for the global layer and ROW/COL for Kartverket", () => {
    // Kartverket's WMTS puts row before column, which is the opposite of the
    // XYZ convention. Swapping them returns a valid tile from the wrong place —
    // a map of somewhere else, drawn without error.
    expect(tileUrl("base", 5, 17, 9)).toContain("/5/17/9");
    expect(tileUrl("grey", 5, 17, 9)).toContain("/5/9/17");
  });

  it("credits whoever actually served the tiles", () => {
    // A licence condition, and it varies by layer: ODbL requires the OSM credit
    // to travel with the data, and CARTO requires theirs. One hardcoded line was
    // correct only while there was one provider.
    expect(creditFor("none")).toContain("OpenStreetMap");
    expect(creditFor("none")).toContain("CARTO");
    // A Kartverket layer is drawn ON TOP of the global base, so both served
    // tiles and both are credited. Only the global layer stands alone.
    expect(creditFor("grey")).toContain("Kartverket");
    expect(creditFor("grey")).toContain("CARTO");
    expect(creditFor("nautical")).toContain("Kartverket");
    expect(creditFor("none")).not.toContain("Kartverket");
  });
});

describe("stacking", () => {
  /**
   * Kartverket's tiles are RGBA and FULLY TRANSPARENT outside Norway — measured
   * pixel by pixel across all four layers: 0 % opaque over Hamburg, 55-66 % over
   * Oslo, the rest being sea and inland water, also transparent. So they are not
   * basemaps at all. They are overlays that happened to have nothing beneath
   * them, which is why the map was white across most of the radar's range.
   */
  const urls = (layer: Parameters<typeof TileLayer>[0]["layer"]) =>
    [...grid({ layer })].map((n) => n.getAttribute("src") ?? "");

  it("draws the global base beneath a Norwegian sheet", () => {
    const u = urls("grey");
    expect(u.some((s) => s.includes("cartocdn"))).toBe(true);
    expect(u.some((s) => s.includes("kartverket"))).toBe(true);
  });

  it("puts the base FIRST, because array order is paint order", () => {
    // Reversed, the global layer would paint over the detail it exists to
    // support — and the map would look correct everywhere except Norway.
    const u = urls("grey");
    expect(u[0]).toContain("cartocdn");
    expect(u[u.length - 1]).toContain("kartverket");
  });

  it("draws the base alone when no sheet is chosen", () => {
    const u = urls("none");
    expect(u.every((s) => s.includes("cartocdn"))).toBe(true);
  });

  it("stacks every Norwegian layer, including the sea charts", () => {
    for (const layer of ["grey", "topo", "detailed", "nautical"] as const) {
      expect(urls(layer).some((s) => s.includes("cartocdn"))).toBe(true);
    }
  });
});
