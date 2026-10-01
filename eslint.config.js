import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/.turbo/**",
      ".screens/**",
      ".lighthouseci/**",
      "playwright-report/**",
      "test-results/**",
      ".spike-cache/**",
      "tests/fixtures/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level TS files are covered by the root tsconfig.json.
          allowDefaultProject: [],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Non-null assertions need a per-line eslint-disable with a justification comment.
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": "warn",
    },
  },
  {
    // Plain JS config files are not part of any tsconfig; skip type-aware rules.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  prettier,
);
