// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DRY, NO_COVERAGE } from "./fieldFormat";

/**
 * Two constants, four places that have to agree about them, and a failure mode
 * that shows nothing on screen except weather that is quietly wrong.
 */
describe("band symbols", () => {
  it("pins the two values the format exists to keep apart", () => {
    // DRY is observed-and-nothing-falling; NO_COVERAGE is could-not-look. If
    // these ever collide the map draws dry ground over the ocean.
    expect(DRY).toBe(0);
    expect(NO_COVERAGE).toBe(7);
  });

  it("agrees with the constant compiled into the shader", async () => {
    // The fragment shader hardcodes the value, because GLSL has no import — it
    // refuses to cross-fade a cell where either frame is unobserved. A silent
    // drift here would blend rain into the unobserved edge for the whole of
    // every transition, which is the one thing the format forbids.
    const src = await readFile(new URL("../components/RadarTilesGL.tsx", import.meta.url), "utf8");
    expect(src).toContain(`const int NO_COVERAGE = ${NO_COVERAGE};`);
  });

  it("agrees with the Go quantiser that writes the bytes", async () => {
    // The server picks the symbols; the client reads them. Nothing checks this
    // at runtime — a mismatch is simply a map that is wrong.
    const go = await readFile(new URL("../../api/internal/field/field.go", import.meta.url), "utf8");
    expect(go).toContain(`Dry byte = ${DRY}`);
    expect(go).toContain(`NoCoverage byte = ${NO_COVERAGE}`);
  });
});
