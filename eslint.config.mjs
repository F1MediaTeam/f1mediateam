import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**",
    "next-env.d.ts",
    // design-sync machine state (generated bundles + staged converter)
    "ds-bundle/**",
    ".ds-sync/**",
    ".design-sync/**",
  ]),
  {
    rules: {
      // Underscore prefix = intentionally unused (the mock adapter's parity
      // stubs keep the Supabase adapter's signatures without using every arg).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // These render @react-pdf/renderer's <Image>, not a DOM <img> —
    // jsx-a11y/alt-text false-positives on the shared component name.
    files: ["src/lib/onboarding-pdf.tsx", "src/lib/pdf-report.tsx", "src/lib/presentation-pdf.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
]);

export default eslintConfig;
