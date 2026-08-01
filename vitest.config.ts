import { defineConfig } from "vitest/config";

// The data layer in lib/ is pure TypeScript with no React, so it runs in plain
// node. Component tests will need jsdom plus a react-native -> react-native-web
// alias; add that when the first component lands, not before.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "screens/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
  },
});
