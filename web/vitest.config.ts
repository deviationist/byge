import { createRequire } from "node:module";
import { dirname } from "node:path";
import react from "@vitejs/plugin-react";
import { uniwind } from "uniwind/vite";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
// Pin react-native-web to one copy. Two copies mean two Reacts, and the hook
// dispatcher nulls the moment a View mounts.
const rnw = dirname(require.resolve("react-native-web/package.json"));

export default defineConfig({
  // The same Tailwind compilation the Metro build performs. Without it
  // `className` renders nothing under vitest, so every colour assertion would
  // pass vacuously against an unstyled element.
  plugins: [react(), uniwind({ cssEntryFile: "./global.css" })],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: rnw }],
  },
  // Metro defines `__DEV__`; Vite does not. Uniwind's web components read it at
  // render time, so without this every component that renders one dies with
  // `ReferenceError: __DEV__ is not defined`.
  define: { __DEV__: "true" },
  test: {
    include: [
      "{lib,components,layouts,screens,hooks,theme,app,scripts,i18n}/**/*.test.{ts,tsx}",
    ],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // uniwind's plugin aliases the package to its raw TypeScript source, and
    // Vite does not transform node_modules by default — without inlining, every
    // suite dies on `SyntaxError: Unexpected token 'typeof'`.
    server: { deps: { inline: ["uniwind"] } },
  },
});
