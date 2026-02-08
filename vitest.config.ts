import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/__tests__/**/*.test.ts", "packages/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
