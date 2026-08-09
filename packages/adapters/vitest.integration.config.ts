import { defineConfig } from "vitest/config";

/**
 * Separate from vitest.config.ts deliberately: these tests need Docker
 * (a real Postgres running the M10 migration, plus PostgREST in front of
 * it) and take real wall-clock time to start a container, so they're
 * opt-in via `pnpm test:integration` rather than part of the default
 * `pnpm test` loop every other package in this repo expects to be fast and
 * network-free.
 */
export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
