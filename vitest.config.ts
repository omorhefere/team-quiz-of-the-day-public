import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["app/lib/**", "app/db/**"],
    },
  },
  resolve: {
    alias: {
      "~": new URL("./app/", import.meta.url).pathname,
    },
  },
});
