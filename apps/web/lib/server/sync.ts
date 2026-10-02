import {
  DEFAULT_STALE_MS,
  enqueue,
  getRequest,
  isMigrated,
  lastRequestAt,
  lastSuccessAt,
  latestRunPerJob,
  listPending,
  type DbHandle,
} from "@sideline/db";
import {
  SYNC_JOB_NAMES,
  SyncRunRequestBodySchema,
  SyncRunResponseSchema,
  SyncStatusResponseSchema,
  type SyncJobName,
  type SyncJobStatus,
} from "@sideline/shared";
import { z } from "zod";
import { getDb } from "./db";
import { errorResult, type ApiResult } from "./http";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * Default refresh cadence per job in ms (PLAN 3.1). A job is stale when its last success is older
 * than 2x this value (PLAN 3.4). `null` means the job never recurs (one-time backfill): it is
 * stale only until it has succeeded once. Stats, projections and nflverse are not listed in 3.1;
 * their values here are the worker's expected cadence (hourly, 6 h, daily).
 */
export const JOB_CADENCE_MS: Record<SyncJobName, number | null> = {
  state: 15 * MIN,
  league: HOUR,
  users: HOUR,
  rosters: 15 * MIN,
  matchups: 15 * MIN,
  transactions: 15 * MIN,
  players: 24 * HOUR,
  trending: 30 * MIN,
  stats: HOUR,
  projections: 6 * HOUR,
  backfill_2025: null,
  nflverse: 24 * HOUR,
};

export const STALE_FACTOR = 2;
/** Minimum gap between manual sync requests for the same job. */
export const REQUEST_DEBOUNCE_MS = 60 * 1000;

export function isStale(job: SyncJobName, lastSuccessIso: string | null, nowMs: number): boolean {
  if (lastSuccessIso === null) return true;
  const cadence = JOB_CADENCE_MS[job];
  if (cadence === null) return false;
  const at = Date.parse(lastSuccessIso);
  if (Number.isNaN(at)) return true;
  return nowMs - at > STALE_FACTOR * cadence;
}

/** Runs `fn` against a migrated DB, or returns a 503 result. */
function withMigratedDb(fn: (h: DbHandle) => ApiResult): ApiResult {
  try {
    const dbState = getDb();
    if (!dbState.ok) return errorResult(503, "db_unavailable", "Database unavailable.");
    if (!isMigrated(dbState.handle)) {
      return errorResult(503, "db_not_migrated", "Database is not migrated yet.");
    }
    return fn(dbState.handle);
  } catch {
    return errorResult(503, "db_unavailable", "Database unavailable.");
  }
}

export function getSyncStatus(now: Date = new Date()): ApiResult {
  return withMigratedDb((h) => {
    const runs = new Map(latestRunPerJob(h).map((r) => [r.job, r]));
    const jobs: SyncJobStatus[] = SYNC_JOB_NAMES.map((job) => {
      const success = lastSuccessAt(h, job);
      return {
        job,
        lastRun: runs.get(job) ?? null,
        lastSuccessAt: success,
        stale: isStale(job, success, now.getTime()),
      };
    });
    const body = SyncStatusResponseSchema.parse({ jobs, pending: listPending(h) });
    return { status: 200, body };
  });
}

/** `rawBody` is the request text; empty means `{}` (job 'all'). */
export function requestSync(rawBody: string, now: Date = new Date()): ApiResult {
  let json: unknown = {};
  if (rawBody.trim() !== "") {
    try {
      json = JSON.parse(rawBody);
    } catch {
      return errorResult(400, "invalid_body", "Body must be valid JSON.");
    }
  }
  const parsed = SyncRunRequestBodySchema.safeParse(json);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return errorResult(400, "invalid_body", summary);
  }
  const { job } = parsed.data;
  return withMigratedDb((h) => {
    // Same blocking rule as enqueue(): pending, or running that started within the stale window.
    const cutoff = new Date(now.getTime() - DEFAULT_STALE_MS).toISOString();
    const active = h.sqlite
      .prepare(
        "SELECT id FROM sync_requests WHERE job = ? AND (status = 'pending' OR (status = 'running' AND started_at >= ?)) ORDER BY id LIMIT 1",
      )
      .get(job, cutoff) as { id: number } | undefined;
    if (active) {
      const existing = getRequest(h, active.id);
      if (existing) return { status: 200, body: runBody(existing, true) };
    }
    const last = lastRequestAt(h, job);
    if (last !== null) {
      const elapsed = now.getTime() - Date.parse(last);
      if (elapsed < REQUEST_DEBOUNCE_MS) {
        const retryAfter = Math.max(1, Math.ceil((REQUEST_DEBOUNCE_MS - elapsed) / 1000));
        return errorResult(
          429,
          "rate_limited",
          `Sync was requested recently. Try again in ${retryAfter}s.`,
          {
            "Retry-After": String(retryAfter),
          },
        );
      }
    }
    const request = enqueue(h, job, "api", now);
    // Another process may have queued one between the probe and enqueue; enqueue then returns it.
    const deduplicated = request.requestedAt !== now.toISOString() || request.status !== "pending";
    return { status: deduplicated ? 200 : 202, body: runBody(request, deduplicated) };
  });
}

function runBody(request: z.input<typeof SyncRunResponseSchema>["request"], deduplicated: boolean) {
  return SyncRunResponseSchema.parse({ request, deduplicated });
}
