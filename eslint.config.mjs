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

// packages/* are plain TypeScript with no React/DOM — a lighter rule set
// than apps/web needs.
const packagesConfig = defineConfig({
  files: ["packages/**/*.{ts,tsx}"],
  extends: [tseslint.configs.recommended],
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
