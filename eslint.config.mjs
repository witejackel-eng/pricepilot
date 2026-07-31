import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",

    // Phase 1 (production-readiness): legacy-storage.ts is migration-only.
    // Production code must NOT import it — primary data lives in IndexedDB.
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["@/lib/pricepilot/legacy-storage", "@/lib/pricepilot/legacy-storage/*", "./legacy-storage", "./legacy-storage/*"],
        message: "legacy-storage.ts is migration-only. Primary data must be read/written through IndexedDB (@/lib/pricepilot/database) or UI-preferences (@/lib/pricepilot/app-settings). Allowed only inside migration.ts, app-settings.ts, and the migration test file.",
        allowTypeImports: false,
      }],
    }],
  },
}, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills",
    // The legacy-storage module itself, and the migration that reads
    // its legacy keys, are exempt from the no-restricted-imports rule.
    "src/lib/pricepilot/legacy-storage.ts",
    "src/lib/pricepilot/migration.ts",
    "src/lib/pricepilot/app-settings.ts",
    "src/lib/pricepilot/__tests__/import-persistence.test.ts",
    // Coverage artifacts are not linted.
    "coverage/**",
  ]
}];

export default eslintConfig;
