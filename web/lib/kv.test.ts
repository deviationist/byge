import { afterEach, describe, expect, it } from "vitest";
import { getItem, removeItem, setItem } from "./kv";

/**
 * The failure paths, because they are the reason this module exists as
 * something other than a direct localStorage call.
 *
 * Storage can be absent (a prerender pass) or refuse to write (Safari private
 * mode, quota exhausted). Neither is worth losing a verdict over, so every
 * operation is best-effort — and "best-effort" is only true if it is tested,
 * otherwise it is just an untested try/catch.
 */

const real = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: real,
    configurable: true,
    writable: true,
  });
  real.clear();
});

function replaceStorage(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("kv round trip", () => {
  it("stores and reads back", () => {
    setItem("k", "v");
    expect(getItem("k")).toBe("v");
  });

  it("returns null for an absent key rather than undefined", () => {
    expect(getItem("never-written")).toBeNull();
  });

  it("removes", () => {
    setItem("k", "v");
    removeItem("k");
    expect(getItem("k")).toBeNull();
  });
});

describe("kv when storage is unavailable", () => {
  it("reads as empty rather than throwing", () => {
    replaceStorage(undefined);
    expect(getItem("k")).toBeNull();
  });

  it("swallows writes instead of crashing the render that triggered them", () => {
    replaceStorage(undefined);
    expect(() => setItem("k", "v")).not.toThrow();
    expect(() => removeItem("k")).not.toThrow();
  });
});

describe("kv when storage refuses", () => {
  // Safari in private mode historically threw on setItem rather than failing
  // quietly, and a quota-exhausted store still does.
  const throwing = {
    getItem() {
      throw new Error("nope");
    },
    setItem() {
      throw new Error("quota");
    },
    removeItem() {
      throw new Error("nope");
    },
  };

  it("treats a throwing read as no value", () => {
    replaceStorage(throwing);
    expect(getItem("k")).toBeNull();
  });

  it("lets a rejected write pass silently — the answer on screen still stands", () => {
    replaceStorage(throwing);
    expect(() => setItem("k", "v")).not.toThrow();
    expect(() => removeItem("k")).not.toThrow();
  });
});
