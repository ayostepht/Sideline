/** Pure helpers for the onboarding flow and Settings sync controls. No clock access: time is passed in. */

export type OnboardingPhaseName =
  "idle" | "resolving_user" | "loading_leagues" | "ready" | "failed" | "worker_offline";

export type OnboardingStep = "username" | "progress" | "leagues" | "failed" | "offline";

/** Which screen a server phase maps to. */
export function stepForPhase(phase: OnboardingPhaseName): OnboardingStep {
  switch (phase) {
    case "idle":
      return "username";
    case "resolving_user":
    case "loading_leagues":
      return "progress";
    case "ready":
      return "leagues";
    case "failed":
      return "failed";
    case "worker_offline":
      return "offline";
  }
}

/** Phases that never change on their own, so polling stops. */
export function isTerminalPhase(phase: OnboardingPhaseName): boolean {
  return phase !== "resolving_user" && phase !== "loading_leagues";
}

export const POLL_START_MS = 1500;
export const POLL_MAX_MS = 5000;

/** Delay before poll number `attempt` (0 based): 1.5 s, growing by half each time, capped at 5 s. */
export function pollDelay(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(POLL_MAX_MS, Math.round(POLL_START_MS * 1.5 ** n));
}

/** Jobs that must have a fresh successful run before the first sync counts as done. */
export const FIRST_SYNC_JOBS = ["league", "users", "rosters"] as const;
export type FirstSyncJob = (typeof FIRST_SYNC_JOBS)[number];
export type FirstSyncState = "done" | "running" | "failed" | "waiting";

export interface JobRunLike {
  job: string;
  lastRun: { status: string; finishedAt: string | null } | null;
}

/**
 * State of each first-sync job. A job is done when its latest run succeeded and finished at or
 * after `sinceMs` (null accepts any success). A failed latest run after `sinceMs` is "failed".
 */
export function firstSyncProgress(
  jobs: readonly JobRunLike[],
  sinceMs: number | null,
): { states: Record<FirstSyncJob, FirstSyncState>; allDone: boolean } {
  const states = {} as Record<FirstSyncJob, FirstSyncState>;
  for (const name of FIRST_SYNC_JOBS) {
    const run = jobs.find((j) => j.job === name)?.lastRun ?? null;
    let state: FirstSyncState = "waiting";
    if (run !== null) {
      const finished = run.finishedAt === null ? Number.NaN : Date.parse(run.finishedAt);
      const fresh = sinceMs === null || (!Number.isNaN(finished) && finished >= sinceMs);
      if (run.status === "running") state = "running";
      else if (run.status === "success" && fresh) state = "done";
      else if (run.status === "failed" && fresh) state = "failed";
    }
    states[name] = state;
  }
  return { states, allDone: FIRST_SYNC_JOBS.every((n) => states[n] === "done") };
}

/** Seconds from a Retry-After header (delta seconds or an HTTP date). Null when unusable. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Math.max(1, Number(v));
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  return Math.max(1, Math.ceil((at - nowMs) / 1000));
}

/** Client side username check that mirrors the server rule. Returns an error message or null. */
export function validateUsername(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return "Enter your Sleeper username";
  if (v.length > 40) return "Usernames are at most 40 characters";
  if (!/^[A-Za-z0-9_.]+$/.test(v)) return "Use letters, numbers, underscores and periods only";
  return null;
}

export const STATUS_POLL_DEADLINE_MS = 90_000;
export const FIRST_SYNC_DEADLINE_MS = 120_000;
export const SETTINGS_POLL_DEADLINE_MS = 5 * 60_000;
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Consecutive request failure count after one more result. A success resets it. */
export function nextFailureCount(previous: number, ok: boolean): number {
  return ok ? 0 : previous + 1;
}

/** True when a poll should stop: past the deadline, or too many failures in a row. */
export function pollShouldGiveUp(opts: {
  startedMs: number;
  nowMs: number;
  deadlineMs: number;
  failures: number;
  maxFailures?: number;
}): boolean {
  return (
    opts.nowMs - opts.startedMs >= opts.deadlineMs ||
    opts.failures >= (opts.maxFailures ?? MAX_CONSECUTIVE_FAILURES)
  );
}

/** Where to go after selecting a league. `rate_limited` means no new sync, so data already exists. */
export function nextAfterSelect(sync: string): "home" | "sync" {
  return sync === "rate_limited" ? "home" : "sync";
}

/** First job that failed in the first sync, or null. */
export function failedFirstSyncJob(
  states: Record<FirstSyncJob, FirstSyncState>,
): FirstSyncJob | null {
  return FIRST_SYNC_JOBS.find((j) => states[j] === "failed") ?? null;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True for the SQLite error a not yet migrated database throws. */
export function isMissingTableError(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e instanceof Error; i++) {
    if (/no such table/i.test(e.message)) return true;
    e = e.cause;
  }
  return false;
}

/** Server `syncSince` (ISO) to epoch ms for comparing with job `finishedAt`. Null when absent or invalid. */
export function syncSinceMs(syncSince: string | null | undefined): number | null {
  if (syncSince === null || syncSince === undefined) return null;
  const t = Date.parse(syncSince);
  return Number.isNaN(t) ? null : t;
}
