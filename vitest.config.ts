import { defineConfig } from "vitest/config";

const packageDirs = [
  "apps/web",
  "apps/worker",
  "packages/shared",
  "packages/sleeper",
  "packages/providers",
  "packages/db",
  "packages/core",
];

/**
 * Root Vitest config. Each workspace package is a project; unit tests are co-located
 * `*.test.ts` files next to the code they cover.
 *
 * Adding integration tests later (qa-engineer): add a project entry such as
 *   { test: { name: "integration", include: ["tests/integration/**\/*.test.ts"] } }
 * to `projects` below, and add its own script (`test:integration`) that runs
 * `vitest run --project integration`. Keep it out of `test:unit` by giving the unit projects
 * names and having `test:unit` select them with `--project`.
 *
 * Coverage thresholds follow PLAN.md 10.5 and apply per glob, so stub packages stay green.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    retry: 0,
    projects: [
      ...packageDirs.map((dir) => ({
        test: {
          name: dir.replace(/^(apps|packages)\//, ""),
          root: dir,
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
        },
      })),
      // Self-tests for the test harness itself (MSW fixture handlers). Part of `test:unit`.
      {
        test: {
          name: "harness",
          include: ["tests/harness/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["apps/*/src/**/*.ts", "apps/web/lib/server/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
      thresholds: {
        "packages/core/**": { lines: 90, branches: 85 },
        "packages/sleeper/**": { lines: 85 },
        "packages/providers/**": { lines: 85 },
        "packages/db/**": { lines: 75 },
        "apps/web/lib/server/**": { lines: 75 },
      },
    },
  },
});
