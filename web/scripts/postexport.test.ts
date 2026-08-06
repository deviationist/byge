// @vitest-environment node
import { describe, expect, it } from "vitest";
import { injectHead } from "./postexport.mjs";

const EXPO_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>byge</title>
  <meta name="theme-color" content="#F6F4F0">
</head>
  <body><div id="root"></div></body>
</html>`;

describe("injectHead", () => {
  const out = injectHead(EXPO_HTML);

  it("links the manifest Expo does not emit", () => {
    expect(out).toContain('rel="manifest"');
  });

  it("replaces the bare theme-color with a per-scheme pair", () => {
    // A single light theme-color leaves dark-mode browser chrome mismatched.
    expect(out).not.toMatch(/<meta name="theme-color" content="[^"]*">\s*$/m);
    expect(out).toContain('media="(prefers-color-scheme: light)"');
    expect(out).toContain('media="(prefers-color-scheme: dark)"');
  });

  it("uses the manifest background colours, so the splash hands over seamlessly", () => {
    expect(out).toContain("#F6F4F0");
    expect(out).toContain("#0E1113");
  });

  it("sets viewport-fit=cover so safe-area insets are real on notched phones", () => {
    expect(out).toContain("viewport-fit=cover");
    expect(out).not.toContain("shrink-to-fit=no");
  });

  it("adds the iOS tags, which the manifest cannot carry", () => {
    expect(out).toContain("apple-mobile-web-app-capable");
    expect(out).toContain("apple-touch-icon");
  });

  it("is idempotent — a second run must not double the tags", () => {
    expect(injectHead(out)).toBe(out);
  });
});
