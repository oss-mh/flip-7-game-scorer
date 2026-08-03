import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

// Applies to every workspace: TypeScript-aware import ordering. Uses the
// import-x plugin key (not "import") so it can never collide with the
// "import" plugin instance eslint-config-next registers for apps/web below.
const importOrder = defineConfig({
  files: ["**/*.{ts,tsx,mts,cts}"],
  extends: [importX.flatConfigs.recommended, importX.flatConfigs.typescript],
  rules: {
    "import-x/order": [
      "error",
      {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
  },
});

// DOM/BOM globals that only exist in a browser. tsconfig already excludes
// the DOM lib so these are compile errors too, but that's only a static
// type hole away from being routed around (e.g. `declare global`) — this
// rule is scope analysis, not type analysis, so it can't be dodged that way.
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "alert",
  "confirm",
  "prompt",
  "location",
  "history",
];

// The system clock and system entropy sources banned from packages/engine.
// See AGENTS.md invariant #2, "No non-determinism in the domain": a Clock
// or IdGenerator port takes their place so replaying a log always produces
// byte-identical state. `Math.random()` is banned separately below, since
// `no-restricted-globals` can't ban one property of the `Math` global
// without banning legitimate deterministic methods (`Math.floor`, etc.)
// alongside it.
const NON_DETERMINISM_GLOBALS = ["Date", "crypto"];

// packages/* are plain TypeScript with no React/Next — apps/web is the only
// workspace allowed to depend on either. This alone doesn't ban the DOM:
// packages/adapters (M3) legitimately needs `localStorage`/`window` for its
// LocalStorage adapter, so the DOM/determinism bans below are scoped more
// narrowly to packages/engine specifically. See AGENTS.md,
// "packages/engine stays pure".
const packagesConfig = defineConfig({
  files: ["packages/**/*.{ts,tsx}"],
  extends: [tseslint.configs.recommended],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react",
            message: "packages/* must never depend on React. See AGENTS.md.",
          },
          {
            name: "react-dom",
            message: "packages/* must never depend on React. See AGENTS.md.",
          },
          {
            name: "next",
            message: "packages/* must never depend on Next.js. See AGENTS.md.",
          },
        ],
        patterns: [
          {
            group: ["react/*", "react-dom/*", "next/*"],
            message: "packages/* must never depend on React or Next.js. See AGENTS.md.",
          },
        ],
      },
    ],
  },
});

// packages/engine specifically must stay pure: no DOM, no system clock, no
// system entropy. See AGENTS.md, "packages/engine stays pure" and
// invariant #2, "No non-determinism in the domain".
const enginePurityConfig = defineConfig({
  files: ["packages/engine/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-globals": [
      "error",
      ...DOM_GLOBALS.map((name) => ({
        name,
        message:
          "packages/engine is pure domain logic and must never touch the DOM. Take a port (Clock/IdGenerator/etc.) instead. See AGENTS.md.",
      })),
      ...NON_DETERMINISM_GLOBALS.map((name) => ({
        name,
        message:
          "packages/engine must never touch the system clock or system entropy directly. Take a Clock or IdGenerator port instead. See AGENTS.md.",
      })),
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "Math",
        property: "random",
        message:
          "packages/engine must never call Math.random() directly. Take a Shuffler or IdGenerator port instead. See AGENTS.md.",
      },
    ],
  },
});

// The one intentional exception to the ban above: deterministic
// Clock/IdGenerator/Shuffler test doubles need `Date` as vocabulary to
// build a fake from a fixed input (e.g. `new Date(fixedMs).toISOString()`).
// They never read the wall clock — `crypto` and `Math.random()` stay
// banned here too, since a real seeded PRNG is exactly the point of a
// `Shuffler` double, not a shortcut around building one.
const engineTestingDoublesConfig = defineConfig({
  files: ["packages/engine/src/testing/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-globals": [
      "error",
      ...DOM_GLOBALS.map((name) => ({
        name,
        message:
          "packages/engine is pure domain logic and must never touch the DOM. Take a port (Clock/IdGenerator/etc.) instead. See AGENTS.md.",
      })),
      {
        name: "crypto",
        message:
          "Deterministic test doubles must never touch system entropy either. Build a seeded fake instead. See AGENTS.md.",
      },
    ],
  },
});

// apps/web is the only workspace that gets React/Next-specific rules.
// `settings.next.rootDir` tells eslint-config-next's rules (e.g.
// no-html-link-for-pages) where the app directory actually lives, since
// eslint runs from the monorepo root rather than apps/web itself.
const webConfig = defineConfig({
  files: ["apps/web/**/*.{ts,tsx}"],
  extends: [nextCoreWebVitals, nextTypescript],
  settings: {
    next: {
      rootDir: "apps/web",
    },
  },
  rules: {
    // apps/web must resolve concrete storage adapters at a single
    // composition root, never import them directly elsewhere. See
    // AGENTS.md, "apps/web never imports a concrete adapter".
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@flip-7/adapters", "@flip-7/adapters/*"],
            message:
              "apps/web must not import a concrete adapter directly — only the port type, resolved at the single composition root. See AGENTS.md.",
          },
        ],
      },
    ],
  },
});

// The one exception to webConfig's adapter import ban: the composition root
// itself, which is the single place allowed to choose a concrete adapter.
// See AGENTS.md, "apps/web never imports a concrete adapter".
const compositionRootConfig = defineConfig({
  files: ["apps/web/lib/compositionRoot.ts"],
  rules: {
    "no-restricted-imports": "off",
  },
});

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
  ]),
  importOrder,
  packagesConfig,
  enginePurityConfig,
  engineTestingDoublesConfig,
  webConfig,
  compositionRootConfig,
  eslintConfigPrettier,
]);
