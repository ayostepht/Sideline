import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

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

// The web server needs a DATA_DIR (/api/health answers 503 without one). Use a fresh temp dir,
// never the developer's real data. The main process creates it once and exports it so worker
// processes that re-import this config see the same value instead of creating more.
const dataDir = process.env["E2E_DATA_DIR"] ?? mkdtempSync(path.join(tmpdir(), "sideline-e2e-"));
process.env["E2E_DATA_DIR"] = dataDir;

const startServer =
  externalBaseUrl === undefined &&
  process.env["E2E_SKIP_SERVER"] !== "1" &&
  !onlyHelperSpecRequested();

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
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "mobile-pixel",
      use: { ...devices["Pixel 7"] },
    },
  ],
  ...(startServer
    ? {
        webServer: {
          // Same standalone server the Docker image runs (build, then copy static assets and start).
          command:
            "pnpm --filter @sideline/web build && pnpm --filter @sideline/web start:standalone",
          url: `${baseURL}/api/health`,
          env: { PORT: String(PORT), HOSTNAME: HOST, DATA_DIR: dataDir },
          // Never reuse: a stale local server (old build, real DATA_DIR) would silently be tested.
          // To test a running server on purpose, set E2E_BASE_URL.
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }
    : {}),
});
