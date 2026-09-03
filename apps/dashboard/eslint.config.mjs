import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Module boundaries (see src/modules/README.md).
 *
 *   core     ← anyone may import
 *   domain   → its own files, core, libs/*
 *   domain A → domain B ONLY through B's index.ts
 *
 * Enforced here rather than documented and hoped for: at 200 endpoints the
 * difference between a layered codebase and a mesh is whether the rule fails
 * CI. Each domain forbids DEEP imports of its siblings; the barrel
 * (`@/modules/<domain>`) stays allowed.
 */
const DOMAINS = ["identity", "catalog", "fulfillment", "inventory", "finance", "support", "platform"];

const boundaryRules = DOMAINS.map((domain) => ({
  files: [`src/modules/${domain}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: DOMAINS.filter((d) => d !== domain).map((other) => ({
          // The trailing `!…/index.ts` entries re-allow the barrel itself.
          // It has to be importable BY FILE, not just as a directory: bare
          // directory imports resolve in the bundler but not in plain Node
          // ESM, which is what `node --test` runs on.
          group: [
            `@/modules/${other}/*`,
            `../${other}/*`,
            `../../${other}/*`,
            `!@/modules/${other}/index.ts`,
            `!../${other}/index.ts`,
            `!../../${other}/index.ts`,
          ],
          message: `Cross-domain import: use the barrel "@/modules/${other}/index.ts" instead of reaching inside it. If the export doesn't belong there, it probably belongs in core.`,
        })),
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // core is infrastructure: it must not depend on any domain, or the
  // dependency arrow reverses and everything becomes circular.
  {
    files: ["src/modules/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "../*/"],
              message: "core must not import from a domain — dependencies point inward, toward core.",
            },
          ],
        },
      ],
    },
  },
  ...boundaryRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
