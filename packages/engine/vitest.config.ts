import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Belt-and-braces: the build output shouldn't contain test files (see
    // tsconfig.build.json), but don't let a stray dist/ ever get double-run.
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
