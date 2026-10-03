/**
 * Soak-tests the production Docker image against real Sleeper data for a configurable
 * duration. Phase 4's gate needs 30 minutes; Phase 6's T6.4 reuses this unchanged for 60.
 *
 * Usage:
 *   pnpm gate:soak [--minutes=30]
 *
 * What it does:
 *   1. Builds the production image (plain `docker build`, same invocation as checks.ts's
 *      dockerCheck).
 *   2. Starts it with real Sleeper credentials read from the repo root .env (the same
 *      posture as `pnpm dev:lan`). The container's own `/data` volume is a fresh, anonymous
 *      Docker volume private to this one container, never a bind mount to Steph's real
 *      ./data, so a soak run can never touch or corrupt her live synced database.
 *   3. Waits for /api/health to return 200.
 *   4. Polls every ~60s for the configured duration: the container is still running,
 *      /api/health still returns 200, and `sync_runs` (read inside the container with its
 *      own better-sqlite3, via `docker exec`, so no host/container filesystem boundary is
 *      ever crossed) has no failed row and no row that has been running longer than
 *      DEFAULT_STALE_MS (@sideline/db's own threshold for a presumed-orphaned run) without
 *      a finished_at.
 *   5. Prints a PASS/FAIL summary and always removes the container (and its volume) and the
 *      temporary env file, even on failure or Ctrl-C.
 *
 * Privacy: SLEEPER_USERNAME and DEFAULT_LEAGUE_ID (and the other .env values the container
 * needs) are read only from the repo root .env at runtime, written to a 0600 temp file and
 * handed to the container with `docker run --env-file`, never as a `-e KEY=VALUE` argument
 * (which would show up in this script's own command-line logging, `docker inspect`, and
 * `ps`) and never printed to stdout/stderr or into docs/gates output.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_STALE_MS } from "@sideline/db";
import { SyncRunStatusSchema } from "@sideline/shared";
import { loadLocalEnv } from "../lib/dotenv.js";
import { sleep, waitForStatus } from "../lib/server.js";
import { runCapture, runLogged } from "./exec.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const HEALTH_DEADLINE_MS = 60_000;
const POLL_INTERVAL_MS = 60_000;

/** .env keys passed through to the container, via a temp --env-file only (see module doc). */
const ENV_PASSTHROUGH_KEYS = [
  "SLEEPER_USERNAME",
  "DEFAULT_LEAGUE_ID",
  "TZ",
  "APP_PASSWORD",
  "SESSION_SECRET",
  "PUID",
  "PGID",
  "ENABLE_NFLVERSE",
  "ODDS_API_KEY",
  "LOG_LEVEL",
] as const;

class UsageError extends Error {}

function parseMinutes(argv: readonly string[]): number {
  let minutes = 30;
  for (const arg of argv) {
    if (arg.startsWith("--minutes=")) {
      const raw = arg.slice("--minutes=".length);
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        throw new UsageError(`--minutes must be a positive number, got "${raw}"`);
      }
      minutes = n;
    } else {
      throw new UsageError(`unknown argument "${arg}". Usage: pnpm gate:soak [--minutes=30]`);
    }
  }
  return minutes;
}

const SyncRunRowSchema = z.object({
  id: z.number(),
  job: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: SyncRunStatusSchema,
  error: z.string().nullable(),
});
type SyncRunRow = z.infer<typeof SyncRunRowSchema>;
const SyncRunsSnapshotSchema = z.object({ exists: z.boolean(), rows: z.array(SyncRunRowSchema) });

/**
 * better-sqlite3 is a transitive dependency of @sideline/db (not a direct dependency of
 * @sideline/worker), so pnpm's strict linking does not hoist it into the worker's own
 * node_modules: a plain `require("better-sqlite3")` from this eval script cannot see it.
 * Resolves its real path once from the pnpm store's directory name, so this does not need to
 * track the pinned version by hand.
 */
async function resolveBetterSqlite3(name: string, logFile: string): Promise<string | undefined> {
  const res = await runCapture(
    "docker",
    [
      "exec",
      name,
      "sh",
      "-c",
      "ls -1 /app/worker/node_modules/.pnpm | grep '^better-sqlite3@' | head -1",
    ],
    { cwd: root, logFile, timeoutMs: 10_000 },
  );
  const dirName = res.stdout.trim().split("\n")[0];
  if (res.code !== 0 || dirName === undefined || dirName === "") return undefined;
  return `/app/worker/node_modules/.pnpm/${dirName}/node_modules/better-sqlite3`;
}

/** Runs entirely inside the container via `docker exec`, so no host/container fs boundary. */
function readSyncRunsScript(betterSqlite3Path: string): string {
  return `
const fs = require("fs");
const dbPath = (process.env.DATA_DIR || "/data") + "/sideline.sqlite";
if (!fs.existsSync(dbPath)) {
  console.log(JSON.stringify({ exists: false, rows: [] }));
  process.exit(0);
}
const Database = require(${JSON.stringify(betterSqlite3Path)});
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const rows = db
  .prepare("SELECT id, job, started_at, finished_at, status, error FROM sync_runs")
  .all();
console.log(JSON.stringify({ exists: true, rows }));
`;
}

type SyncRunsResult =
  { ok: true; exists: boolean; rows: SyncRunRow[] } | { ok: false; error: string };

async function readSyncRuns(
  name: string,
  logFile: string,
  betterSqlite3Path: string,
): Promise<SyncRunsResult> {
  const res = await runCapture(
    "docker",
    ["exec", "-w", "/app/worker", name, "node", "-e", readSyncRunsScript(betterSqlite3Path)],
    { cwd: root, logFile, timeoutMs: 10_000 },
  );
  if (res.code !== 0) {
    return {
      ok: false,
      error: `docker exec failed: ${res.stderr.trim().split("\n").pop() ?? "unknown error"}`,
    };
  }
  try {
    const lastLine = res.stdout.trim().split("\n").pop() ?? "";
    const parsed = SyncRunsSnapshotSchema.parse(JSON.parse(lastLine));
    return { ok: true, ...parsed };
  } catch (err) {
    return {
      ok: false,
      error: `could not parse sync_runs output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function groupByStatus(rows: readonly SyncRunRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

function findFailed(rows: readonly SyncRunRow[]): SyncRunRow[] {
  return rows.filter((r) => r.status === "failed");
}

/** Rows "running" long enough with no finished_at to be presumed stuck (DEFAULT_STALE_MS). */
function findStuck(rows: readonly SyncRunRow[], now: number): SyncRunRow[] {
  return rows.filter((r) => {
    if (r.status !== "running" || r.finished_at !== null) return false;
    const started = Date.parse(r.started_at);
    return Number.isFinite(started) && now - started > DEFAULT_STALE_MS;
  });
}

interface ContainerState {
  running: boolean;
  exitCode?: string;
}

async function containerRunning(name: string, logFile: string): Promise<ContainerState> {
  const res = await runCapture(
    "docker",
    ["inspect", "--format", "{{.State.Running}} {{.State.ExitCode}}", name],
    { cwd: root, logFile },
  );
  if (res.code !== 0) return { running: false };
  const [runningStr, exitCode] = res.stdout.trim().split(" ");
  return exitCode === undefined
    ? { running: runningStr === "true" }
    : { running: runningStr === "true", exitCode };
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

async function dumpContainerLogs(name: string, logFile: string): Promise<void> {
  const logs = await runCapture("docker", ["logs", "--tail", "80", name], { cwd: root, logFile });
  appendFileSync(logFile, `container logs:\n${logs.stdout}${logs.stderr}\n`);
}

async function main(): Promise<number> {
  const minutes = parseMinutes(process.argv.slice(2));
  const durationMs = minutes * 60_000;

  const { loaded } = loadLocalEnv(root);
  if (!loaded) {
    process.stderr.write(
      "gate:soak: no .env file at the repo root. Create one from .env.example with real Sleeper credentials.\n",
    );
    return 1;
  }
  const username = process.env["SLEEPER_USERNAME"]?.trim();
  const leagueId = process.env["DEFAULT_LEAGUE_ID"]?.trim();
  if (username === undefined || username === "" || leagueId === undefined || leagueId === "") {
    process.stderr.write(
      "gate:soak: SLEEPER_USERNAME and DEFAULT_LEAGUE_ID must both be set in the repo root .env for a real soak test.\n",
    );
    return 1;
  }

  const logDir = path.join(root, ".gate", "logs");
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "soak.log");
  writeFileSync(logFile, `soak: starting at ${new Date().toISOString()}, minutes=${minutes}\n`);

  const tag = "sideline-soak:local";
  const name = `sideline-soak-${process.pid}`;

  process.stdout.write(`gate:soak: building ${tag} ...\n`);
  const build = await runLogged("docker", ["build", "-t", tag, "."], {
    cwd: root,
    logFile,
    timeoutMs: 20 * 60_000,
  });
  if (build.code !== 0) {
    process.stderr.write(
      `gate:soak: FAIL - docker build failed (see ${path.relative(root, logFile)})\n`,
    );
    return 1;
  }

  // .env values reach the container only through this temp, 0600 env file -- never as a
  // command-line argument and never printed. Deleted in cleanup() below.
  const envFileDir = mkdtempSync(path.join(tmpdir(), "sideline-soak-env-"));
  const envFile = path.join(envFileDir, "env");
  const envLines = ENV_PASSTHROUGH_KEYS.map((k) => `${k}=${process.env[k] ?? ""}`);
  writeFileSync(envFile, `${envLines.join("\n")}\n`, { mode: 0o600 });

  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await runCapture("docker", ["rm", "-f", "-v", name], { cwd: root, logFile });
    rmSync(envFileDir, { recursive: true, force: true });
  };
  // Never leave the container (or the temp env file) behind, even on Ctrl-C.
  const onSignal = (sig: string): void => {
    process.stdout.write(`\ngate:soak: ${sig} received, cleaning up ...\n`);
    void cleanup().finally(() => process.exit(1));
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  try {
    process.stdout.write(`gate:soak: starting container ${name} ...\n`);
    const run = await runCapture(
      "docker",
      ["run", "-d", "--name", name, "--env-file", envFile, "-p", "127.0.0.1::3000", tag],
      { cwd: root, logFile },
    );
    if (run.code !== 0) {
      process.stderr.write(
        `gate:soak: FAIL - docker run failed: ${run.stderr.trim().split("\n").pop() ?? ""}\n`,
      );
      return 1;
    }

    const portOut = await runCapture("docker", ["port", name, "3000/tcp"], {
      cwd: root,
      logFile,
    });
    const port = /:(\d+)\s*$/m.exec(portOut.stdout)?.[1];
    if (port === undefined) {
      process.stderr.write("gate:soak: FAIL - could not find the published port\n");
      return 1;
    }
    const base = `http://127.0.0.1:${port}`;

    process.stdout.write("gate:soak: waiting for /api/health ...\n");
    const health = await waitForStatus(`${base}/api/health`, { timeoutMs: HEALTH_DEADLINE_MS });
    if (!health.ok) {
      await dumpContainerLogs(name, logFile);
      process.stderr.write(
        `gate:soak: FAIL - /api/health did not return 200 within ${HEALTH_DEADLINE_MS / 1000}s (see ${path.relative(root, logFile)})\n`,
      );
      return 1;
    }

    const sqlitePath = await resolveBetterSqlite3(name, logFile);
    if (sqlitePath === undefined) {
      process.stderr.write(
        "gate:soak: FAIL - could not resolve better-sqlite3 inside the container to read sync_runs\n",
      );
      return 1;
    }

    const startedAt = Date.now();
    const deadline = startedAt + durationMs;
    process.stdout.write(
      `gate:soak: healthy. polling every ${POLL_INTERVAL_MS / 1000}s for ${minutes} minute(s) ...\n`,
    );

    let lastSnapshot: SyncRunRow[] = [];
    let failure: string | undefined;
    while (Date.now() < deadline) {
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
      const elapsed = Date.now() - startedAt;

      const state = await containerRunning(name, logFile);
      if (!state.running) {
        await dumpContainerLogs(name, logFile);
        failure = `container stopped running after ${fmtDuration(elapsed)} (exit code ${state.exitCode ?? "unknown"})`;
        break;
      }

      const healthNow = await waitForStatus(`${base}/api/health`, { timeoutMs: 10_000 });
      if (!healthNow.ok) {
        failure = `/api/health stopped returning 200 after ${fmtDuration(elapsed)} (last status ${healthNow.status ?? "none"})`;
        break;
      }

      const snap = await readSyncRuns(name, logFile, sqlitePath);
      if (!snap.ok) {
        failure = `could not read sync_runs after ${fmtDuration(elapsed)}: ${snap.error}`;
        break;
      }
      lastSnapshot = snap.rows;
      const failed = findFailed(snap.rows);
      const firstFailed = failed[0];
      if (firstFailed !== undefined) {
        failure = `sync run failed after ${fmtDuration(elapsed)}: job=${firstFailed.job} error=${firstFailed.error ?? "(none)"}`;
        break;
      }
      const stuck = findStuck(snap.rows, Date.now());
      const firstStuck = stuck[0];
      if (firstStuck !== undefined) {
        failure = `sync run stuck after ${fmtDuration(elapsed)}: job=${firstStuck.job} started=${firstStuck.started_at} (no finished_at after ${DEFAULT_STALE_MS / 60_000} min)`;
        break;
      }
      process.stdout.write(
        `gate:soak: [${fmtDuration(elapsed)}] healthy, sync_runs=${snap.rows.length}\n`,
      );
    }

    // Best-effort refresh for the summary when the loop broke for a non-sync_runs reason
    // (container stopped, health failed) or never got far enough to read sync_runs at all.
    if (failure === undefined || !failure.startsWith("sync run")) {
      const finalSnap = await readSyncRuns(name, logFile, sqlitePath);
      if (finalSnap.ok) lastSnapshot = finalSnap.rows;
    }

    const totalElapsed = Date.now() - startedAt;
    const counts = groupByStatus(lastSnapshot);
    const errors = findFailed(lastSnapshot).map((r) => `${r.job}: ${r.error ?? "(no message)"}`);

    process.stdout.write("\ngate:soak summary\n");
    process.stdout.write(`  result:    ${failure === undefined ? "PASS" : "FAIL"}\n`);
    process.stdout.write(`  uptime:    ${fmtDuration(totalElapsed)}\n`);
    process.stdout.write(`  sync_runs: ${JSON.stringify(counts)}\n`);
    if (errors.length > 0) process.stdout.write(`  errors:    ${errors.join("; ")}\n`);
    if (failure !== undefined) process.stdout.write(`  reason:    ${failure}\n`);
    process.stdout.write(`  log:       ${path.relative(root, logFile)}\n`);

    return failure === undefined ? 0 : 1;
  } finally {
    await cleanup();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof UsageError) {
      process.stderr.write(`gate:soak: ${err.message}\n`);
      process.exit(1);
    }
    process.stderr.write(
      `gate:soak crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  },
);
