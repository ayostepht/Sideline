import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config (PLAN.md 10.2: UI1, UI2, UI5; 10.5: retries are 0).
 *
 * - Runs every spec on three projects: desktop-chromium, mobile-iphone (WebKit), mobile-pixel.
 * - Target: `E2E_BASE_URL` if set (an already running server, nothing is started); otherwise the
 *   production web build is built and started on 127.0.0.1:3000.
 * - `E2E_SKIP_SERVER=1` never starts a server (use when you started one yourself without
 *   setting E2E_BASE_URL, or for specs that need no app).
 * - Helper self-tests (`e2e/helpers.spec.ts`) use page.setContent and need no app, so the server
 *   is not started when that is the only spec named on the command line.
 */
const PORT = 3000;
const HOST = "127.0.0.1";
const externalBaseUrl = process.env["E2E_BASE_URL"];
const baseURL = externalBaseUrl ?? `http://${HOST}:${PORT}`;

function onlyHelperSpecRequested(): boolean {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const files = args.filter((a) => a !== "test");
  return files.length > 0 && files.every((a) => /(^|\/)helpers\.spec(\.ts)?$/.test(a));
}

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
          command: "pnpm --filter @sideline/web build && pnpm --filter @sideline/web start",
          url: `${baseURL}/api/health`,
          env: { PORT: String(PORT), HOSTNAME: HOST },
          reuseExistingServer: !process.env["CI"],
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }
    : {}),
});
