const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// Keep colocated tests out of the Metro graph.
//
// We colocate `Foo.test.tsx` next to `Foo.tsx`, but expo-router builds its route
// table from a `require.context` over the whole `app/` dir whose match regex does
// NOT exclude `*.test.*`. A colocated test therefore gets pulled in as a "route",
// dragging its `vitest` import — and transitively vite's module runner — into the
// web bundle, where Metro's transformer chokes and the PWA fails with HTTP 500.
// Blocking them here removes them from the file map before `require.context` sees
// them. Vitest still runs them directly; it never goes through Metro.
const testFiles = /\.(test|spec)\.[jt]sx?$/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [...(Array.isArray(existing) ? existing : [existing]), testFiles]
  : testFiles;

// The Python spike is not part of the app.
config.resolver.blockList = [...config.resolver.blockList, /\/spike\/.*/];

// Uniwind (Tailwind for RN) — Metro plugin only, no Babel.
module.exports = withUniwindConfig(config, { cssEntryFile: "./global.css" });
