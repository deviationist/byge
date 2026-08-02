import { dirname } from "node:path";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
// Pin react-native-web to one copy. Two copies mean two Reacts, and the hook
// dispatcher nulls the moment a View mounts.
const rnw = dirname(require.resolve("react-native-web/package.json"));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: rnw }],
  },
  test: {
    include: ["{lib,components,layouts,screens,hooks,theme,app}/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
