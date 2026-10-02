import { mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { assertSeededDataDir, createSeededDataDir } from "./scripts/lib/seed";

/**
 * Playwright config (PLAN.md 10.2: UI1, UI2, UI5; 10.5: retries are 0).
 *
 * - Runs every spec on three projects: desktop-chromium, mobile-iphone (WebKit), mobile-pixel.
 * - Target: `E2E_BASE_URL` if set (an already running server, nothing is started); otherwise the
 *   production standalone web server (what Docker ships) is built and started on 127.0.0.1:3000.
 * - `E2E_SKIP_SERVER=1` never starts a server (use when you started one yourself without
 *   setting E2E_BASE_URL, or for specs that need no app).
 * - Helper self-tests (`e2e/helpers.spec.ts`) use page.setContent and need no app, so the server
 *   is not started when that is the only spec named on the command line.
 */
const PORT = 3000;
const ONBOARDING_PORT = 3101;
const HOST = "127.0.0.1";
const externalBaseUrl = process.env["E2E_BASE_URL"];
const baseURL = externalBaseUrl ?? `http://${HOST}:${PORT}`;

// CLI options that take a separate value (`--project desktop-chromium`); the value is not a spec.
// Options written as `--opt=value` need no handling because they start with "-".
// `--project` is variadic in Playwright (it swallows every following non-option argument, so
// `--project a spec.ts` treats spec.ts as a project name); it is handled separately below.
const OPTIONS_WITH_VALUE = new Set([
  "-c",
  "-g",
  "-j",
  "--config",
  "--grep",
  "--grep-invert",
  "--workers",
  "--reporter",
  "--retries",
  "--repeat-each",
  "--timeout",
  "--max-failures",
  "--shard",
  "--output",
  "--trace",
  "--tsconfig",
  "--global-timeout",
  "--ui-host",
  "--ui-port",
]);

function onlyHelperSpecRequested(): boolean {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    // Playwright ignores what follows a bare "--" as a file filter; be safe and start the server.
    if (arg === "--") return false;
    if (arg.startsWith("-")) {
      if (OPTIONS_WITH_VALUE.has(arg)) i += 1;
      else if (arg === "--project") {
        while (i + 1 < argv.length && !(argv[i + 1] as string).startsWith("-")) i += 1;
      }
      continue;
    }
    if (arg !== "test") files.push(arg);
  }
  return files.length > 0 && files.every((a) => /(^|\/)helpers\.spec(\.ts)?$/.test(a));
}

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

const startServer =
  externalBaseUrl === undefined &&
  process.env["E2E_SKIP_SERVER"] !== "1" &&
  !onlyHelperSpecRequested();
// The onboarding server (fresh DATA_DIR plus the fixture worker) is also started next to an
// external E2E_BASE_URL server (the gate), because specs need it either way. It does not build:
// a build must already exist (the primary server builds it, or the gate did).
const startOnboardingServer = process.env["E2E_SKIP_SERVER"] !== "1" && !onlyHelperSpecRequested();

// Seeded data dir (never the developer's ./data). `E2E_DATA_DIR` is validated (marker file,
// not inside ./data). Otherwise the main process seeds one fixture dir and exports it, so
// worker processes that re-import this config reuse it instead of seeding again.
const givenDir = process.env["E2E_DATA_DIR"];
if (givenDir !== undefined) {
  assertSeededDataDir(givenDir, REPO_ROOT);
} else if (startServer) {
  process.env["E2E_DATA_DIR"] = (await createSeededDataDir(REPO_ROOT)).dataDir;
}
const dataDir = process.env["E2E_DATA_DIR"] ?? "";

// Onboarding server: a fresh temp dir where onboarding has NOT happened (the web server and the
// fixture worker migrate it). Same export-to-env pattern.
const onboardingDir =
  process.env["E2E_ONBOARDING_DATA_DIR"] ?? mkdtempSync(path.join(tmpdir(), "sideline-e2e-onb-"));
process.env["E2E_ONBOARDING_DATA_DIR"] = onboardingDir;
const onboardingUrl = `http://${HOST}:${ONBOARDING_PORT}`;
process.env["E2E_ONBOARDING_URL"] = onboardingUrl;

const NOT_FOUND_SPEC = /not-found\.spec\.ts/;
const MAIN_PROJECTS = ["desktop-chromium", "mobile-iphone", "mobile-pixel"];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: NOT_FOUND_SPEC,
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 13"] },
      // The first-run flow changes shared onboarding-server state; it runs on desktop only.
      testIgnore: [/onboarding-flow\.spec\.ts/, NOT_FOUND_SPEC],
    },
    {
      name: "mobile-pixel",
      use: { ...devices["Pixel 7"] },
      testIgnore: [/onboarding-flow\.spec\.ts/, NOT_FOUND_SPEC],
    },
    // Not-found pages (Steph's G2 decision, option c; root cause in PROGRESS backlog "TEAM-3
    // flaky e2e test"): they run only after the whole main suite has finished, one project at
    // a time, so nothing loads the server beside them. Assertions are unchanged.
    {
      name: "desktop-chromium-notfound",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testMatch: NOT_FOUND_SPEC,
      // One worker runs this file top to bottom; repeats and files never overlap.
      fullyParallel: false,
      dependencies: MAIN_PROJECTS,
    },
    {
      name: "mobile-iphone-notfound",
      use: { ...devices["iPhone 13"] },
      testMatch: NOT_FOUND_SPEC,
      // One worker runs this file top to bottom; repeats and files never overlap.
      fullyParallel: false,
      dependencies: ["desktop-chromium-notfound"],
    },
    {
      name: "mobile-pixel-notfound",
      use: { ...devices["Pixel 7"] },
      testMatch: NOT_FOUND_SPEC,
      // One worker runs this file top to bottom; repeats and files never overlap.
      fullyParallel: false,
      dependencies: ["mobile-iphone-notfound"],
    },
  ],
  webServer: [
    ...(startServer
      ? [
          {
            // Same standalone server the Docker image runs (build, then copy static assets and start).
            command:
              "pnpm --filter @sideline/web build && pnpm --filter @sideline/web start:standalone",
            url: `${baseURL}/api/health`,
            // SIDELINE_GALLERY: the /dev/gallery route 404s in production builds without it.
            env: {
              PORT: String(PORT),
              HOSTNAME: HOST,
              DATA_DIR: dataDir,
              SIDELINE_GALLERY: "1",
            },
            // Never reuse: a stale local server (old build, real DATA_DIR) would silently be tested.
            // To test a running server on purpose, set E2E_BASE_URL.
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
    ...(startOnboardingServer
      ? [
          {
            // Web server plus the fixture-mode worker on one fresh DATA_DIR. The worker starts
            // once the web server answers (the web server migrates first, so the two never race
            // on a new database). `trap` stops both when Playwright terminates the process group.
            command: [
              "trap 'kill 0' EXIT TERM INT",
              "pnpm --filter @sideline/web start:standalone &",
              `until curl -sf ${onboardingUrl}/api/health >/dev/null; do sleep 0.5; done`,
              "env -u DEFAULT_LEAGUE_ID NODE_ENV=test pnpm --filter @sideline/worker start:fixtures &",
              "wait",
            ].join("\n"),
            url: `${onboardingUrl}/api/health`,
            env: {
              PORT: String(ONBOARDING_PORT),
              HOSTNAME: HOST,
              DATA_DIR: onboardingDir,
              SIDELINE_GALLERY: "1",
            },
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
  ],
});
