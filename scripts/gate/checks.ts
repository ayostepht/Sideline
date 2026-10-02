import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { isPortFree, waitForStatus } from "../lib/server.js";
import type { GateContext, Outcome } from "./context.js";
import { runCapture } from "./exec.js";
import { summarizeCoverage } from "./coverage.js";
import { LIGHTHOUSE_BUDGETS, readLhrs, summarizeLhrs } from "./lighthouse.js";
import { evaluatePlaywright, summarizePlaywright } from "./playwright-json.js";
import { collectRouteSizes, ROUTE_JS_BUDGET_BYTES, routesOverBudget } from "./routes-size.js";
import { scanRepo } from "./u4-scan.js";
import { compareWarnings, countEslintMessages } from "./warnings.js";
import { namedExactly } from "./flags.js";

export interface CheckDef {
  id: string;
  name: string;
  /** Needs a browser or the docker daemon, so --fast skips it. */
  slow?: "e2e" | "docker";
  run(ctx: GateContext): Promise<Outcome>;
}

/** HOST-5: image at most 400 MB. */
export const IMAGE_BUDGET_BYTES = 419_430_400;
const HEALTH_DEADLINE_MS = 30_000;

function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

const fail = (reason: string, metrics?: Record<string, unknown>): Outcome =>
  metrics === undefined ? { status: "FAIL", reason } : { status: "FAIL", reason, metrics };

async function u1(ctx: GateContext): Promise<Outcome> {
  const verify = await ctx.step("U1", "pnpm", ["verify"]);
  if (verify.mapped.status !== "PASS") return verify.mapped;
  const eslintJson = path.join(ctx.gateDir, "eslint.json");
  rmSync(eslintJson, { force: true });
  const lint = await ctx.step("U1", "pnpm", [
    "exec",
    "eslint",
    ".",
    "--format",
    "json",
    "--output-file",
    eslintJson,
  ]);
  if (lint.mapped.status !== "PASS")
    return fail(`eslint json run failed (${lint.mapped.reason ?? "unknown"})`);
  const counts = existsSync(eslintJson) ? countEslintMessages(readJsonFile(eslintJson)) : undefined;
  if (counts === undefined) return fail("could not read eslint json output");
  const metrics = {
    eslintWarnings: counts.warnings,
    eslintErrors: counts.errors,
    previousEslintWarnings: ctx.previous.eslintWarnings ?? null,
  };
  const cmp = compareWarnings(ctx.previous.eslintWarnings, counts.warnings);
  if (!cmp.ok) return fail(cmp.reason ?? "eslint warnings increased", metrics);
  ctx.newEslintBaseline = counts.warnings;
  return { status: "PASS", metrics };
}

async function u2a(ctx: GateContext): Promise<Outcome> {
  const summaryFile = path.join(ctx.root, "coverage/coverage-summary.json");
  rmSync(summaryFile, { force: true });
  const run = await ctx.step("U2a", "pnpm", ["test:coverage"]);
  if (run.mapped.status !== "PASS") return run.mapped;
  const coverage = existsSync(summaryFile)
    ? summarizeCoverage(readJsonFile(summaryFile), ctx.root)
    : undefined;
  if (coverage === undefined)
    return fail("coverage summary missing or unreadable after a passing run");
  return { status: "PASS", metrics: { coverage } };
}

async function u2b(ctx: GateContext): Promise<Outcome> {
  return (await ctx.step("U2b", "pnpm", ["test:integration"])).mapped;
}

async function u3a(ctx: GateContext): Promise<Outcome> {
  const build = await ctx.step("U3a", "pnpm", ["build"]);
  ctx.build = build.mapped.status === "PASS" ? "ok" : "failed";
  if (build.mapped.status !== "PASS") return build.mapped;
  let sizes;
  try {
    sizes = collectRouteSizes(path.join(ctx.root, "apps/web/.next"));
  } catch (err) {
    return fail(
      `could not measure route JS sizes: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (sizes.length === 0)
    return fail("no page routes found in the build output, cannot check the JS budget");
  const routes = Object.fromEntries(sizes.map((s) => [s.route, s.gzipBytes]));
  const metrics = { routeJsGzipBytes: routes, budgetBytes: ROUTE_JS_BUDGET_BYTES };
  const over = routesOverBudget(sizes);
  if (over.length > 0) {
    return fail(
      `route JS over ${ROUTE_JS_BUDGET_BYTES} gzipped bytes: ${over.map((s) => `${s.route} ${s.gzipBytes}`).join(", ")}`,
      metrics,
    );
  }
  return { status: "PASS", metrics };
}

function u4Scan(ctx: GateContext): Outcome {
  const { filesScanned, findings } = scanRepo(ctx.root);
  const lines = findings.map((f) => `${f.file}:${f.line} [${f.rule}] ${f.message}: ${f.text}`);
  writeFileSync(ctx.logFile("U4"), `scanned ${filesScanned} files\n${lines.join("\n")}\n`);
  const byRule: Record<string, number> = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  const metrics = { filesScanned, findings: findings.length, byRule };
  const first = findings[0];
  if (first !== undefined) {
    return fail(
      `${findings.length} finding(s), first: ${first.file}:${first.line} [${first.rule}]`,
      metrics,
    );
  }
  return { status: "PASS", metrics };
}

async function playwrightCheck(
  ctx: GateContext,
  id: "UI1" | "UI2",
  script: "test:e2e" | "test:a11y",
): Promise<Outcome> {
  const buildFailure = await ctx.ensureBuild(id);
  if (buildFailure !== undefined) return { status: "SKIPPED", reason: buildFailure };
  let baseUrl: string;
  try {
    baseUrl = (await ctx.ensureServer(id)).baseUrl;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const jsonFile = path.join(ctx.gateDir, `playwright-${id}.json`);
  rmSync(jsonFile, { force: true });
  const run = await ctx.step(id, "pnpm", [script, "--reporter=list,json"], {
    env: {
      E2E_BASE_URL: baseUrl,
      E2E_DATA_DIR: await ctx.seededDataDir(id),
      SIDELINE_GALLERY: "1",
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
    },
  });
  const summary = existsSync(jsonFile)
    ? summarizePlaywright(readJsonFile(jsonFile), ["UI2", "UI5"])
    : undefined;
  const metrics = summary === undefined ? undefined : { ...summary };
  if (run.mapped.status !== "PASS")
    return metrics === undefined ? run.mapped : { ...run.mapped, metrics };
  if (summary === undefined)
    return fail("playwright passed but its JSON report is missing or unreadable");
  const problem = evaluatePlaywright(summary);
  if (problem !== undefined) return fail(problem, metrics);
  return { status: "PASS", metrics: metrics ?? {} };
}

/** Screens run on a seeded fixture DB; the output must say so, or the check fails. */
async function ui4(ctx: GateContext): Promise<Outcome> {
  const buildFailure = await ctx.ensureBuild("UI4");
  if (buildFailure !== undefined) return { status: "SKIPPED", reason: buildFailure };
  await ctx.stopServer();
  const run = await ctx.step("UI4", "pnpm", ["screens"]);
  const log = readFileSync(ctx.logFile("UI4"), "utf8");
  if (!/^screens: DATA_DIR \S.* \(seeded fixture\)$/m.test(log)) {
    return fail("screens output has no 'DATA_DIR <path> (seeded fixture)' line (unverified fails)");
  }
  return run.mapped;
}

/** Prefer an explicit CHROME_PATH, else the Chromium that Playwright installed. */
function chromePath(): string | undefined {
  const fromEnv = process.env["CHROME_PATH"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  try {
    const p = chromium.executablePath();
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

async function ui3(ctx: GateContext): Promise<Outcome> {
  const buildFailure = await ctx.ensureBuild("UI3");
  if (buildFailure !== undefined) return { status: "SKIPPED", reason: buildFailure };
  await ctx.stopServer();
  // lighthouserc.json starts its own server on port 3000 and waits for "Ready in".
  if (!(await isPortFree(3000))) {
    return fail(
      "port 3000 is in use; lhci needs it free to start its own server (see lighthouserc.json)",
    );
  }
  const lhciDir = path.join(ctx.root, ".lighthouseci");
  for (const stale of lhrFiles(lhciDir)) rmSync(stale, { force: true });
  const chrome = chromePath();
  // lighthouserc.json must read E2E_DATA_DIR for its server (T2.5a); the gate always offers it.
  const run = await ctx.step("UI3", "pnpm", ["lhci"], {
    env: {
      E2E_DATA_DIR: await ctx.seededDataDir("UI3"),
      SIDELINE_GALLERY: "1",
      ...(chrome === undefined ? {} : { CHROME_PATH: chrome }),
    },
  });
  const scores = summarizeLhrs(readLhrs(lhciDir));
  const metrics = { scores, budgets: LIGHTHOUSE_BUDGETS, chromePath: chrome ?? null };
  if (run.mapped.status !== "PASS") return { ...run.mapped, metrics };
  if (Object.keys(scores).length === 0)
    return fail("lhci passed but wrote no Lighthouse reports", metrics);
  return { status: "PASS", metrics };
}

function lhrFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => /^lhr-.*\.json$/.test(n))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

async function dockerCheck(
  ctx: GateContext,
  id: "U3b" | "U3c",
  platform: string | undefined,
): Promise<Outcome> {
  const log = ctx.logFile(id);
  const info = await runCapture("docker", ["info", "--format", "{{.ServerVersion}}"], {
    cwd: ctx.root,
    logFile: log,
    timeoutMs: 20_000,
  });
  if (info.code !== 0)
    return {
      status: "SKIPPED",
      reason: "docker is not available (CLI missing or daemon not running)",
    };
  const tag = `sideline-gate:${platform === undefined ? "native" : "amd64"}`;
  const name = `sideline-gate-${process.pid}-${platform === undefined ? "native" : "amd64"}`;
  const buildArgs =
    platform === undefined
      ? ["build", "-t", tag, "."]
      : ["buildx", "build", "--platform", platform, "--load", "-t", tag, "."];
  const build = await ctx.step(id, "docker", buildArgs);
  if (build.mapped.status !== "PASS") {
    return build.mapped.status === "SKIPPED"
      ? build.mapped
      : fail(`docker build failed (${build.mapped.reason ?? "unknown"})`);
  }
  const inspect = await runCapture(
    "docker",
    ["image", "inspect", "--format", "{{.Size}} {{.Architecture}}", tag],
    { cwd: ctx.root, logFile: log },
  );
  const [sizeText, architecture] = inspect.stdout.trim().split(" ");
  const sizeBytes = Number(sizeText);
  if (inspect.code !== 0 || !Number.isFinite(sizeBytes))
    return fail("could not read the image size from docker image inspect");
  const metrics: Record<string, unknown> = {
    image: tag,
    imageSizeBytes: sizeBytes,
    imageSizeMb: Math.round((sizeBytes / 1_048_576) * 10) / 10,
    architecture: architecture ?? null,
  };
  try {
    const t0 = Date.now();
    const runArgs = [
      "run",
      "-d",
      "--name",
      name,
      ...(platform === undefined ? [] : ["--platform", platform]),
      "-p",
      "127.0.0.1::3000",
      tag,
    ];
    const run = await runCapture("docker", runArgs, { cwd: ctx.root, logFile: log });
    if (run.code !== 0)
      return fail(`docker run failed: ${run.stderr.trim().split("\n").pop() ?? ""}`, metrics);
    const portOut = await runCapture("docker", ["port", name, "3000/tcp"], {
      cwd: ctx.root,
      logFile: log,
    });
    const port = /:(\d+)\s*$/m.exec(portOut.stdout)?.[1];
    if (port === undefined)
      return fail("could not find the published port of the container", metrics);
    const base = `http://127.0.0.1:${port}`;
    const health = await waitForStatus(`${base}/api/health`, { timeoutMs: HEALTH_DEADLINE_MS });
    metrics["startupSeconds"] = Math.round(((Date.now() - t0) / 1000) * 10) / 10;
    if (!health.ok) {
      const logs = await runCapture("docker", ["logs", "--tail", "50", name], {
        cwd: ctx.root,
        logFile: log,
      });
      appendFileSync(log, `container logs:\n${logs.stdout}${logs.stderr}\n`);
      return fail(
        `/api/health did not return 200 within ${HEALTH_DEADLINE_MS / 1000} s (last status ${health.status ?? "none"})`,
        metrics,
      );
    }
    // "/" may redirect (for example to onboarding), so any 2xx or 3xx counts.
    const home = await waitForStatus(`${base}/`, {
      timeoutMs: 5000,
      accept: (status) => status >= 200 && status < 400,
    });
    if (!home.ok)
      return fail(
        `GET / did not return 2xx or 3xx (last status ${home.status ?? "none"})`,
        metrics,
      );
    if (sizeBytes > IMAGE_BUDGET_BYTES) {
      return fail(
        `image is ${String(metrics["imageSizeMb"])} MB, over the 400 MB limit (HOST-5)`,
        metrics,
      );
    }
    return { status: "PASS", metrics };
  } finally {
    // Always remove, even when `docker run` failed halfway. "No such container" is fine.
    await runCapture("docker", ["rm", "-f", "-v", name], { cwd: ctx.root, logFile: log });
  }
}

export const CHECKS: CheckDef[] = [
  { id: "U1", name: "Typecheck, lint, format, unit tests (pnpm verify)", run: u1 },
  { id: "U2a", name: "Unit tests with coverage thresholds", run: u2a },
  { id: "U2b", name: "Integration tests", run: u2b },
  { id: "U3a", name: "Production build and route JS budget", run: u3a },
  {
    id: "U4",
    name: "Static scan: skips, any, lint disables, TODOs",
    run: (ctx) => Promise.resolve(u4Scan(ctx)),
  },
  {
    id: "UI1",
    name: "E2E suite on all Playwright projects (includes UI5)",
    slow: "e2e",
    run: (ctx) => playwrightCheck(ctx, "UI1", "test:e2e"),
  },
  {
    id: "UI2",
    name: "axe accessibility, light and dark",
    slow: "e2e",
    run: (ctx) => playwrightCheck(ctx, "UI2", "test:a11y"),
  },
  {
    id: "UI4",
    name: "Screenshots at 390/768/1280, light and dark, from the seeded fixture DB",
    slow: "e2e",
    run: ui4,
  },
  { id: "UI3", name: "Lighthouse mobile budgets", slow: "e2e", run: ui3 },
  {
    id: "U3b",
    name: "Docker image builds, starts, serves /api/health",
    slow: "docker",
    run: (ctx) => dockerCheck(ctx, "U3b", undefined),
  },
  {
    id: "U3c",
    name: "Docker image for linux/amd64 builds, starts, serves /api/health",
    slow: "docker",
    run: (ctx) => dockerCheck(ctx, "U3c", "linux/amd64"),
  },
];

/** Returns a SKIPPED reason when flags say the check should not run, else undefined. */
export function flagSkipReason(
  check: CheckDef,
  flags: { skipDocker: boolean; fast: boolean; amd64: boolean; only: string[] | undefined },
): string | undefined {
  if (check.id === "U3c" && !flags.amd64 && !namedExactly("U3c", flags.only))
    return "pass --amd64 to include the linux/amd64 build";
  if (flags.fast && check.slow !== undefined) return "--fast";
  if (flags.skipDocker && check.slow === "docker") return "--skip-docker";
  return undefined;
}
