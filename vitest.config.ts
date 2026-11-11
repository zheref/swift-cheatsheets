import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "gatsby-*.{ts,tsx}"],
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
