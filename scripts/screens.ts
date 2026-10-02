import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { z } from "zod";
import { createSeededDataDir, type SeededDataDir } from "./lib/seed.js";
import { redactHome } from "./lib/paths.js";
import { planDataDir, type DataDirPlan } from "./screens/datadir.js";
import { standaloneBuildExists, startStandaloneServer, type RunningServer } from "./lib/server.js";
import {
  assertRoute,
  parseScreensArgs,
  screenshotPath,
  ScreensArgError,
  THEMES,
  WIDTHS,
} from "./screens/args.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT_HEIGHT = 900;

function loadConfiguredRoutes(): string[] {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(root, "scripts/screens/routes.json"), "utf8"),
  );
  const routes = z.array(z.string()).min(1).parse(raw);
  routes.forEach(assertRoute);
  return routes;
}

async function main(): Promise<number> {
  let routes: string[];
  let plan: DataDirPlan;
  try {
    const args = parseScreensArgs(process.argv.slice(2));
    routes = args.routes ?? loadConfiguredRoutes();
    plan = planDataDir({
      root,
      env: process.env,
      dataDirFlag: args.dataDir,
      unverified: args.unverified,
    });
  } catch (err) {
    if (err instanceof Error && !(err instanceof ScreensArgError)) {
      process.stderr.write(`screens: ${err.message}\n`);
      return 1;
    }
    if (err instanceof ScreensArgError) {
      process.stderr.write(`screens: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  let server: RunningServer | undefined;
  let seeded: SeededDataDir | undefined;
  let subdir = "";
  let baseUrl = process.env["E2E_BASE_URL"];
  if (baseUrl === undefined || baseUrl === "") {
    if (!standaloneBuildExists(root)) {
      process.stderr.write(
        'screens: no production build found. Run "pnpm build" first, or set E2E_BASE_URL to a running server.\n',
      );
      return 1;
    }
    let dataDir: string;
    if (plan.kind === "given") {
      dataDir = plan.dataDir;
    } else {
      seeded = await createSeededDataDir(root);
      dataDir = seeded.dataDir;
    }
    process.stdout.write(`screens: DATA_DIR ${redactHome(dataDir)} (seeded fixture)\n`);
    server = await startStandaloneServer({ root, dataDir, env: { SIDELINE_GALLERY: "1" } });
    baseUrl = server.baseUrl;
    process.stdout.write(`screens: started the standalone server at ${baseUrl}\n`);
  } else {
    subdir = "unverified";
    process.stdout.write("screens: DATA_DIR unverified\n");
    process.stdout.write(`screens: using the running server at ${baseUrl}\n`);
  }

  const failures: string[] = [];
  const written: string[] = [];
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    for (const route of routes) {
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          const label = `${route} at ${width}px ${theme}`;
          let context: BrowserContext | undefined;
          try {
            context = await browser.newContext({
              viewport: { width, height: VIEWPORT_HEIGHT },
              colorScheme: theme,
              reducedMotion: "reduce",
              deviceScaleFactor: 1,
            });
            const page = await context.newPage();
            const response = await page.goto(new URL(route, baseUrl).toString(), {
              waitUntil: "networkidle",
            });
            if (response === null || !response.ok()) {
              failures.push(`${label}: HTTP ${response?.status() ?? "no response"}`);
              continue;
            }
            await page.evaluate("document.fonts.ready.then(() => true)");
            const file = screenshotPath(root, route, width, theme, subdir);
            mkdirSync(path.dirname(file), { recursive: true });
            await page.screenshot({ path: file, fullPage: true });
            written.push(path.relative(root, file));
          } catch (err) {
            // Record the failure and keep going so one bad page does not hide the others.
            failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            await context?.close().catch(() => undefined);
          }
        }
      }
    }
  } catch (err) {
    failures.push(`browser: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await browser?.close().catch(() => undefined);
    if (server !== undefined) await server.stop();
    seeded?.cleanup();
  }

  process.stdout.write(`screens: wrote ${written.length} screenshot(s)\n`);
  for (const f of written) process.stdout.write(`  ${f}\n`);
  for (const f of failures) process.stderr.write(`screens: FAILED ${f}\n`);
  return failures.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `screens crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  },
);
