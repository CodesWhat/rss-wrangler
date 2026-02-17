import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend",
          include: [
            "apps/api/**/__tests__/**/*.test.ts",
            "apps/worker/**/__tests__/**/*.test.ts",
            "packages/**/__tests__/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        test: {
          name: "web",
          include: ["apps/web/**/__tests__/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
        esbuild: {
          jsx: "automatic",
          jsxImportSource: "react",
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "apps/web/src"),
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["apps/*/src/**", "packages/*/src/**"],
      exclude: [
        "node_modules",
        "dist",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__tests__/**",
        ".next",
      ],
    },
  },
});
