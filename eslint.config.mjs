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

// packages/* are plain TypeScript with no React/DOM — a lighter rule set
// than apps/web needs, plus the architectural boundary: the engine must
// stay pure. See AGENTS.md, "packages/engine stays pure".
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
            message:
              "packages/engine is pure domain logic and must never depend on React. See AGENTS.md.",
          },
          {
            name: "react-dom",
            message:
              "packages/engine is pure domain logic and must never depend on React. See AGENTS.md.",
          },
          {
            name: "next",
            message:
              "packages/engine is pure domain logic and must never depend on Next.js. See AGENTS.md.",
          },
        ],
        patterns: [
          {
            group: ["react/*", "react-dom/*", "next/*"],
            message:
              "packages/engine is pure domain logic and must never depend on React or Next.js. See AGENTS.md.",
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...DOM_GLOBALS.map((name) => ({
        name,
        message:
          "packages/engine is pure domain logic and must never touch the DOM. Take a port (Clock/IdGenerator/etc.) instead. See AGENTS.md.",
      })),
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
    //
    // packages/adapters doesn't exist yet (it lands in M3); once the
    // composition root file exists, add a second config object here
    // scoped to that file's path with this rule turned back off.
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
  webConfig,
  eslintConfigPrettier,
]);
