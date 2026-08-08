import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Belt-and-braces: the build output shouldn't contain test files (see
    // tsconfig.build.json), but don't let a stray dist/ ever get double-run.
    // `*.integration.test.ts` needs Docker (Postgres + PostgREST) and isn't
    // part of the default fast loop — see `pnpm test:integration` and
    // supabaseGameServerActions.integration.test.ts.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
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
