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
 * Opt-in projects. `integration` (MSW + temp SQLite) and `contract` (live Sleeper, schema only)
 * are NOT part of the default run, so `pnpm test:unit` and `pnpm verify` are unchanged. They
 * are registered only when named with `--project integration` / `--project contract`.
 */
function requestedProjects(): Set<string> {
  const argv = process.argv.slice(2);
  const names = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--project" && argv[i + 1] !== undefined) names.add(argv[i + 1] as string);
    else if (arg.startsWith("--project=")) names.add(arg.slice("--project=".length));
  }
  return names;
}
const requested = requestedProjects();

/**
 * `*.perf.test.ts` files assert real wall-clock budgets, which V8 coverage instrumentation
 * inflates by 10x+ for call-heavy tests (found at the G4 gate: WAIVER-2's 450-solve perf test
 * went from ~266ms uninstrumented to 2000-3800ms instrumented, failing its own margin and the
 * real spec budget, even though production is unaffected). Coverage-threshold runs don't need
 * them anyway: the functions they exercise are already covered by sibling non-perf tests.
 * Excluded only from `--coverage` runs; `pnpm verify`/`test:unit` (no `--coverage`) still run
 * them with their real, meaningful budget assertions.
 */
const coverageRequested = process.argv.includes("--coverage");

/**
 * Root Vitest config. Each workspace package is a project; unit tests are co-located
 * `*.test.ts` files next to the code they cover.
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
          // Keep the project root at the repo root (do not set `root: dir`): coverage globs are
          // repo-relative, and a package-level root made `--coverage --project X` print Unknown%.
          include: [`${dir}/**/*.test.{ts,tsx}`],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.next/**",
            // No literal dot before "perf": matches both `foo.perf.test.ts` and a bare
            // `perf.test.ts` (e.g. apps/web/lib/server/perf.test.ts), which "**/*.perf.test.ts"
            // misses since `*` can't also consume the leading dot it's followed by.
            ...(coverageRequested ? ["**/*perf.test.ts"] : []),
          ],
        },
      })),
      // Self-tests for the test harness itself (MSW fixture handlers). Part of `test:unit`.
      {
        test: {
          name: "harness",
          include: ["tests/harness/**/*.test.ts"],
        },
      },
      // Unit tests for repo scripts (fixture recorder, gate, screens). Part of `test:unit`.
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.ts"],
        },
      },
      // T3.6: golden and property tests for the lineup optimizer, black-box against
      // packages/core's public exports. Pure in-memory, no I/O; part of `test:unit`.
      {
        test: {
          name: "optimizer-suites",
          include: ["tests/golden/**/*.test.ts", "tests/property/**/*.test.ts"],
        },
      },
      ...(requested.has("integration")
        ? [
            {
              test: {
                name: "integration",
                include: ["tests/integration/**/*.test.ts"],
                // Temp SQLite plus MSW; slower than unit tests but still fully offline.
                testTimeout: 30_000,
                hookTimeout: 30_000,
              },
            },
          ]
        : []),
      ...(requested.has("contract")
        ? [
            {
              test: {
                name: "contract",
                include:
                  process.env["CONTRACT_PLAYERS"] === "1"
                    ? ["tests/contract/**/*.test.ts"]
                    : ["tests/contract/sleeper.contract.test.ts"],
                // Live network; schema validation only.
                testTimeout: 60_000,
                hookTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "apps/*/src/**/*.ts",
        "apps/web/lib/server/**/*.ts",
        "apps/web/app/api/**/*.ts",
        "packages/*/src/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
      thresholds: {
        "packages/core/**": { lines: 90, branches: 85 },
        "packages/sleeper/**": { lines: 85 },
        "packages/providers/**": { lines: 85 },
        "packages/db/**": { lines: 75 },
        "apps/web/lib/server/**": { lines: 75 },
        "apps/web/app/api/**": { lines: 75 },
        "apps/worker/**": { lines: 75 },
      },
    },
  },
});
