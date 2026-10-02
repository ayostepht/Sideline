import { pathToFileURL } from "node:url";
import {
  dbPathFromDataDir,
  enqueue,
  getRequest,
  migrate,
  openDb,
  readHeartbeat,
  reapStale,
} from "@sideline/db";
import {
  loadConfig,
  SYNC_JOB_NAMES,
  SyncJobNameSchema,
  WORKER_STALE_AFTER_MS,
  type AppConfig,
  type SyncJobName,
} from "@sideline/shared";
import { RateLimiter } from "@sideline/sleeper";
import pino, { type Logger } from "pino";
import { registeredJobs } from "../jobs/index.js";
import { LEASE_RENEW_MS, LeaseKeeper, newHolderId } from "../lease.js";
import { createJobRegistry, type JobRegistry } from "../registry.js";
import { runJobs } from "../runner.js";

export const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

export interface CliDeps {
  config: AppConfig;
  registry: JobRegistry;
  limiter: RateLimiter;
  logger: Logger;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  out: (line: string) => void;
  holder?: string;
  pollMs?: number;
}

export type ParsedArgs = { ok: true; job: SyncJobName | "all" } | { ok: false; message: string };

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let once = false;
  let job: string = "all";
  for (const a of argv) {
    if (a === "--once") once = true;
    else if (a.startsWith("--job=")) job = a.slice("--job=".length);
    else return { ok: false, message: `unknown argument: ${a}` };
  }
  if (!once) return { ok: false, message: "usage: sync --once [--job=<name|all>]" };
  if (job === "all") return { ok: true, job };
  const parsed = SyncJobNameSchema.safeParse(job);
  if (!parsed.success) {
    return { ok: false, message: `unknown job "${job}"; valid: all, ${SYNC_JOB_NAMES.join(", ")}` };
  }
  return { ok: true, job: parsed.data };
}

/** Returns the process exit code: 0 ok, 1 a job failed, 2 usage error or lease unavailable. */
export async function runSyncCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv);
  if (!args.ok) {
    deps.out(args.message);
    return 2;
  }
  const names = args.job === "all" ? deps.registry.allInOrder() : [args.job];
  if (args.job === "all" ? names.length === 0 : !deps.registry.has(args.job)) {
    deps.out(`no job registered for ${args.job}`);
    return 2;
  }
  const db = openDb(dbPathFromDataDir(deps.config.dataDir));
  try {
    migrate(db);
    const hb = readHeartbeat(db);
    const alive = hb !== null && deps.now().getTime() - Date.parse(hb.at) < WORKER_STALE_AFTER_MS;
    if (alive) {
      const req = enqueue(db, args.job, "cli", deps.now());
      deps.out(`worker is running; queued request #${req.id} (${args.job}), waiting`);
      const start = deps.now().getTime();
      for (;;) {
        const cur = getRequest(db, req.id);
        if (cur !== null && (cur.status === "done" || cur.status === "failed")) {
          deps.out(`request #${req.id} ${cur.status}${cur.error !== null ? `: ${cur.error}` : ""}`);
          return cur.status === "done" ? 0 : 1;
        }
        if (deps.now().getTime() - start >= WAIT_TIMEOUT_MS) {
          deps.out(`timed out waiting for request #${req.id}`);
          return 1;
        }
        await deps.sleep(deps.pollMs ?? 1000);
      }
    }

    const lease = new LeaseKeeper(db, deps.holder ?? newHolderId(), deps.now);
    if (!lease.tryAcquire()) {
      deps.out("another process holds the sync lease; try again shortly");
      return 2;
    }
    const timer = setInterval(() => lease.renew(), LEASE_RENEW_MS);
    timer.unref();
    try {
      reapStale(db, deps.now(), 0);
      const outcomes = await runJobs(
        {
          db,
          limiter: deps.limiter,
          logger: deps.logger,
          config: deps.config,
          now: deps.now,
          signal: () => lease.signal,
        },
        deps.registry,
        names,
      );
      for (const o of outcomes) {
        deps.out(
          `${o.job}: ${o.status}, ${o.callsMade} calls, ${o.rowsChanged} rows changed${o.error !== null ? `, error: ${o.error}` : ""}`,
        );
      }
      return outcomes.some((o) => o.status === "failed") || lease.signal.aborted ? 1 : 0;
    } finally {
      clearInterval(timer);
      lease.release();
    }
  } finally {
    db.sqlite.close();
  }
}

/* eslint-disable no-console -- CLI output */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig(process.env);
  const logger = pino({ level: config.logLevel }, pino.destination(2));
  runSyncCli(process.argv.slice(2), {
    config,
    registry: createJobRegistry(registeredJobs),
    limiter: new RateLimiter(),
    logger,
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    out: (l) => console.log(l),
  }).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
