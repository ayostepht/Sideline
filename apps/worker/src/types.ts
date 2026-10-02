import type { DbHandle } from "@sideline/db";
import type { AppConfig, SyncJobName } from "@sideline/shared";
import type { CallCounter, RateLimiter } from "@sideline/sleeper";
import type { Logger } from "pino";

/** Everything a job may use. One shared limiter per process; one counter per run. */
export interface JobContext {
  db: DbHandle;
  /** The single shared limiter: every Sleeper call goes through it (pass `counter` to acquire). */
  limiter: RateLimiter;
  /** Per-run call counter; its total is recorded as `calls_made`. */
  counter: CallCounter;
  now(): Date;
  logger: Logger;
  config: AppConfig;
  /** Aborted when the sync lease is lost or the worker shuts down. Jobs should stop promptly. */
  signal: AbortSignal;
}

export interface JobResult {
  rowsChanged: number;
  status?: "success" | "skipped";
  note?: string;
}

export interface Job {
  name: SyncJobName;
  run(ctx: JobContext): Promise<JobResult>;
}

export interface RunOutcome {
  job: SyncJobName;
  status: "success" | "skipped" | "failed";
  callsMade: number;
  rowsChanged: number;
  error: string | null;
}
