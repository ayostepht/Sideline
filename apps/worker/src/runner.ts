import { finishRun, startRun, type DbHandle } from "@sideline/db";
import type { AppConfig, SyncJobName } from "@sideline/shared";
import { createCallCounter, type RateLimiter } from "@sideline/sleeper";
import type { Logger } from "pino";
import type { JobRegistry } from "./registry.js";
import type { Job, JobContext, RunOutcome } from "./types.js";

export interface RunnerDeps {
  db: DbHandle;
  limiter: RateLimiter;
  logger: Logger;
  config: AppConfig;
  now: () => Date;
  signal: () => AbortSignal;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs one job and records a sync_runs row. Never throws. */
export async function runJob(deps: RunnerDeps, job: Job): Promise<RunOutcome> {
  const logger = deps.logger.child({ job: job.name });
  const counter = createCallCounter();
  let runId: number | null = null;
  try {
    runId = startRun(deps.db, job.name, deps.now());
  } catch (e) {
    logger.error({ err: errMessage(e) }, "could not record run start");
  }
  const ctx: JobContext = {
    db: deps.db,
    limiter: deps.limiter,
    counter,
    now: deps.now,
    logger,
    config: deps.config,
    signal: deps.signal(),
  };
  let outcome: RunOutcome;
  try {
    const res = await job.run(ctx);
    outcome = {
      job: job.name,
      status: res.status ?? "success",
      callsMade: counter.calls,
      rowsChanged: res.rowsChanged,
      error: null,
    };
  } catch (e) {
    logger.error({ err: errMessage(e) }, "job failed");
    outcome = {
      job: job.name,
      status: "failed",
      callsMade: counter.calls,
      rowsChanged: 0,
      error: errMessage(e),
    };
  }
  if (runId !== null) {
    try {
      finishRun(
        deps.db,
        runId,
        {
          status: outcome.status,
          callsMade: outcome.callsMade,
          rowsChanged: outcome.rowsChanged,
          error: outcome.error,
        },
        deps.now(),
      );
    } catch (e) {
      logger.error({ err: errMessage(e) }, "could not record run finish");
    }
  }
  logger.info(
    { status: outcome.status, callsMade: outcome.callsMade, rowsChanged: outcome.rowsChanged },
    "job finished",
  );
  return outcome;
}

/** Runs the named jobs serially; stops early if the signal aborts. Unregistered names fail. */
export async function runJobs(
  deps: RunnerDeps,
  registry: JobRegistry,
  names: readonly SyncJobName[],
): Promise<RunOutcome[]> {
  const out: RunOutcome[] = [];
  for (const name of names) {
    if (deps.signal().aborted) break;
    const job = registry.get(name);
    if (job === undefined) {
      out.push({
        job: name,
        status: "failed",
        callsMade: 0,
        rowsChanged: 0,
        error: `no job registered for ${name}`,
      });
      continue;
    }
    out.push(await runJob(deps, job));
  }
  return out;
}

export function summarizeFailures(outcomes: readonly RunOutcome[]): string | null {
  const failed = outcomes.filter((o) => o.status === "failed");
  if (failed.length === 0) return null;
  return failed.map((o) => `${o.job}: ${o.error ?? "failed"}`).join("; ");
}
