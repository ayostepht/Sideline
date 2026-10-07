import { finishRun, startRun, type DbHandle } from "@sideline/db";
import type { AppConfig, OnboardingJobName, SyncJobName } from "@sideline/shared";
import { createCallCounter, type RateLimiter } from "@sideline/sleeper";
import type { Logger } from "pino";
import type { SleeperJobDeps } from "./jobs/common.js";
import { ensureSleeperUserId, runOnboardingJob } from "./jobs/onboarding.js";
import { JOB_TABLES, recomputeHooks, type RecomputeRegistry } from "./recompute.js";
import type { JobRegistry } from "./registry.js";
import type { Job, JobContext, RunOutcome } from "./types.js";

export interface RunnerDeps {
  db: DbHandle;
  limiter: RateLimiter;
  logger: Logger;
  config: AppConfig;
  now: () => Date;
  signal: () => AbortSignal;
  /** Derived-table recompute hooks; defaults to the process-wide registry. */
  recompute?: RecomputeRegistry;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs one job and records a sync_runs row. Never throws. */
export async function runJob(
  deps: RunnerDeps,
  job: Job,
  target: string | null = null,
): Promise<RunOutcome> {
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
    target,
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
  target: { job: SyncJobName; id: string } | null = null,
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
    out.push(await runJob(deps, job, target !== null && target.job === name ? target.id : null));
  }
  const changed = new Set<string>();
  for (const o of out) {
    if (o.status !== "failed" && o.rowsChanged > 0)
      for (const t of JOB_TABLES[o.job]) changed.add(t);
  }
  await (deps.recompute ?? recomputeHooks).run(deps.db, changed, deps.logger);
  return out;
}

/**
 * Runs one onboarding job (ADR-009). Never throws. No sync_runs row: that table's job column and
 * the shared status list are SyncJobName-only, so the sync_requests row (status, error) is the
 * record and calls made are logged.
 */
export async function runOnboarding(
  deps: RunnerDeps,
  sleeper: SleeperJobDeps,
  job: OnboardingJobName,
  params: unknown,
): Promise<{ error: string | null; callsMade: number; rowsChanged: number }> {
  const logger = deps.logger.child({ job });
  const counter = createCallCounter();
  const ctx: JobContext = {
    db: deps.db,
    limiter: deps.limiter,
    counter,
    now: deps.now,
    logger,
    config: deps.config,
    signal: deps.signal(),
  };
  try {
    const rowsChanged = await runOnboardingJob(ctx, sleeper, job, params);
    logger.info({ callsMade: counter.calls, rowsChanged }, "onboarding job finished");
    return { error: null, callsMade: counter.calls, rowsChanged };
  } catch (e) {
    logger.error({ err: errMessage(e) }, "onboarding job failed");
    return { error: errMessage(e), callsMade: counter.calls, rowsChanged: 0 };
  }
}

/** Resolves a missing sleeper_user_id before league jobs (G2-B1). Never throws. */
export async function ensureUserIdForCycle(
  deps: RunnerDeps,
  sleeper: SleeperJobDeps,
): Promise<void> {
  const ctx: JobContext = {
    db: deps.db,
    limiter: deps.limiter,
    counter: createCallCounter(),
    now: deps.now,
    logger: deps.logger.child({ job: "user" }),
    config: deps.config,
    signal: deps.signal(),
  };
  if (ctx.signal.aborted) return;
  await ensureSleeperUserId(ctx, sleeper, deps.config.sleeperUsername);
}

export function summarizeFailures(outcomes: readonly RunOutcome[]): string | null {
  const failed = outcomes.filter((o) => o.status === "failed");
  if (failed.length === 0) return null;
  return failed.map((o) => `${o.job}: ${o.error ?? "failed"}`).join("; ");
}
