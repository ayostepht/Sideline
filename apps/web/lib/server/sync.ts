import {
  enqueueRequest,
  findActiveRequest,
  getRequest,
  isMigrated,
  lastRequestAt,
  lastSuccessAt,
  latestRunPerJob,
  listPending,
  type DbHandle,
} from "@sideline/db";
import {
  SYNC_CADENCE_MS,
  SYNC_JOB_NAMES,
  SyncRunRequestBodySchema,
  SyncRunResponseSchema,
  SyncStatusResponseSchema,
  type SyncJobName,
  type SyncJobStatus,
  type SyncRequest,
} from "@sideline/shared";
import { z } from "zod";
import { getDb } from "./db";
import { errorResult, type ApiResult } from "./http";

export const STALE_FACTOR = 2;
/** Minimum gap between manual sync requests for the same job. */
export const REQUEST_DEBOUNCE_MS = 60 * 1000;

export function isStale(job: SyncJobName, lastSuccessIso: string | null, nowMs: number): boolean {
  if (lastSuccessIso === null) return true;
  const cadence = SYNC_CADENCE_MS[job];
  if (cadence === null) return false;
  const at = Date.parse(lastSuccessIso);
  if (Number.isNaN(at)) return true;
  return nowMs - at > STALE_FACTOR * cadence;
}

/** Runs `fn` against a migrated DB, or returns a 503 result. */
export function withMigratedDb(fn: (h: DbHandle) => ApiResult): ApiResult {
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
  return withMigratedDb((h) => requestSyncOn(h, job, now));
}

/** Debounce and dedupe rules shared by POST /api/sync/run and league selection. */
export function requestSyncOn(h: DbHandle, job: SyncRequest["job"], now: Date): ApiResult {
  const active = findActiveRequest(h, job, now);
  if (active) return { status: 200, body: runBody(active, true) };
  const last = lastRequestAt(h, job);
  if (last !== null) {
    const elapsed = now.getTime() - Date.parse(last);
    if (elapsed < REQUEST_DEBOUNCE_MS) {
      const retryAfter = Math.max(1, Math.ceil((REQUEST_DEBOUNCE_MS - elapsed) / 1000));
      return errorResult(
        429,
        "rate_limited",
        `Sync was requested recently. Try again in ${retryAfter}s.`,
        { "Retry-After": String(retryAfter) },
      );
    }
  }
  // Another process may have queued one between the probe and enqueue; then created is false.
  const { request, created } = enqueueRequest(h, job, "api", now);
  const deduplicated = !created;
  return { status: deduplicated ? 200 : 202, body: runBody(request, deduplicated) };
}

function runBody(request: z.input<typeof SyncRunResponseSchema>["request"], deduplicated: boolean) {
  return SyncRunResponseSchema.parse({ request, deduplicated });
}

const PendingIdRow = z.object({ id: z.number().int() });

/**
 * Queue an `all` sync after the active league changed. Skips the manual debounce. A pending
 * `all` is reused (it reads the active league when it runs); a running one already read the old
 * league, so a fresh pending one is added behind it.
 */
export function requestSyncForLeagueChange(h: DbHandle, now: Date): ApiResult {
  const tx = h.sqlite.transaction((): { request: SyncRequest; created: boolean } => {
    const pending = h.sqlite
      .prepare(
        "SELECT id FROM sync_requests WHERE job = 'all' AND status = 'pending' ORDER BY id LIMIT 1",
      )
      .get();
    const pendingRow = PendingIdRow.safeParse(pending);
    if (pendingRow.success) {
      const existing = getRequest(h, pendingRow.data.id);
      if (existing === null) throw new Error("sync_requests row not readable");
      return { request: existing, created: false };
    }
    const res = h.sqlite
      .prepare(
        "INSERT INTO sync_requests (job, requested_at, status, source) VALUES ('all', ?, 'pending', 'api')",
      )
      .run(now.toISOString());
    const created = getRequest(h, Number(res.lastInsertRowid));
    if (created === null) throw new Error("sync_requests insert not readable");
    return { request: created, created: true };
  });
  const { request, created } = tx.immediate();
  return { status: created ? 202 : 200, body: runBody(request, !created) };
}
