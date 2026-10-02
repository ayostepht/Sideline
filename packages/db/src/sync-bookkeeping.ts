/**
 * Sync bookkeeping: runs, heartbeat, manual sync requests, the sync lease and the
 * `/players/nfl` once-a-day guard. Every helper takes `now: Date` (never reads the clock).
 * Write transactions are short, and read-modify-write sequences use IMMEDIATE transactions.
 */
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import {
  SyncRequestSchema,
  SyncRunSchema,
  type SyncJobName,
  type SyncRequest,
  type SyncRequestStatus,
  type SyncRun,
  type SyncRunStatus,
} from "@sideline/shared";
import { z } from "zod";
import type { DbHandle } from "./connection.js";
import { appSettings, syncRequests, syncRuns } from "./schema.js";

const iso = (now: Date): string => now.toISOString();

// ---------- app_settings helpers ----------

export const SETTING_HEARTBEAT = "worker_heartbeat";
export const SETTING_LEASE = "sync_lease";
export const SETTING_PLAYERS_FETCHED_AT = "players_fetched_at";

function getSetting(h: DbHandle, key: string): string | null {
  const row = h.db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? null;
}

function setSetting(h: DbHandle, key: string, value: string): void {
  h.db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

function parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------- sync_runs ----------

function toRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return SyncRunSchema.parse({
    id: row.id,
    job: row.job,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status,
    callsMade: row.callsMade,
    rowsChanged: row.rowsChanged,
    error: row.error,
  });
}

/** Inserts a `running` row and returns its id. */
export function startRun(h: DbHandle, job: SyncJobName, now: Date): number {
  const res = h.db
    .insert(syncRuns)
    .values({ job, startedAt: iso(now), status: "running" })
    .run();
  return Number(res.lastInsertRowid);
}

export interface FinishRunInput {
  status: Exclude<SyncRunStatus, "running">;
  callsMade: number;
  rowsChanged: number;
  error: string | null;
}

export function finishRun(h: DbHandle, id: number, input: FinishRunInput, now: Date): void {
  h.db
    .update(syncRuns)
    .set({
      status: input.status,
      callsMade: input.callsMade,
      rowsChanged: input.rowsChanged,
      error: input.error,
      finishedAt: iso(now),
    })
    .where(eq(syncRuns.id, id))
    .run();
}

/** Newest run per job (highest id), sorted by job name. */
export function latestRunPerJob(h: DbHandle): SyncRun[] {
  const rows = h.db
    .select()
    .from(syncRuns)
    .where(sql`${syncRuns.id} IN (SELECT max(id) FROM sync_runs GROUP BY job)`)
    .orderBy(asc(syncRuns.job))
    .all();
  return rows.map(toRun);
}

/** `finished_at` (ISO) of the newest successful run for `job`, or null. */
export function lastSuccessAt(h: DbHandle, job: SyncJobName): string | null {
  const row = h.db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.job, job), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.id))
    .limit(1)
    .get();
  return row?.finishedAt ?? null;
}

// ---------- heartbeat ----------

const HeartbeatSchema = z.object({ at: z.string(), info: z.record(z.string(), z.unknown()) });
export interface Heartbeat {
  /** ISO 8601. */
  at: string;
  info: Record<string, unknown>;
}

export function writeHeartbeat(h: DbHandle, now: Date, info: Record<string, unknown> = {}): void {
  setSetting(h, SETTING_HEARTBEAT, JSON.stringify({ at: iso(now), info }));
}

/** Null when never written or unreadable. */
export function readHeartbeat(h: DbHandle): Heartbeat | null {
  return parseJson(getSetting(h, SETTING_HEARTBEAT), HeartbeatSchema);
}

// ---------- sync_requests ----------

function toRequest(row: typeof syncRequests.$inferSelect): SyncRequest {
  return SyncRequestSchema.parse({
    id: row.id,
    job: row.job,
    requestedAt: row.requestedAt,
    status: row.status,
    source: row.source,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
  });
}

/**
 * Queues a manual sync. If a pending or running request for the same job (`all` counts as its
 * own job) exists, returns it instead of adding a duplicate. Check and insert share one IMMEDIATE
 * transaction so two processes cannot both insert.
 */
export function enqueue(
  h: DbHandle,
  job: SyncRequest["job"],
  source: SyncRequest["source"],
  now: Date,
): SyncRequest {
  return h.db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(syncRequests)
        .where(and(eq(syncRequests.job, job), inArray(syncRequests.status, ["pending", "running"])))
        .orderBy(asc(syncRequests.id))
        .limit(1)
        .get();
      if (existing !== undefined) return toRequest(existing);
      const res = tx
        .insert(syncRequests)
        .values({ job, requestedAt: iso(now), status: "pending", source })
        .run();
      const created = tx
        .select()
        .from(syncRequests)
        .where(eq(syncRequests.id, Number(res.lastInsertRowid)))
        .get();
      if (created === undefined) throw new Error("sync_requests insert not readable");
      return toRequest(created);
    },
    { behavior: "immediate" },
  );
}

/** Atomically moves the oldest pending request to running and returns it; null if none. */
export function claimNext(h: DbHandle, now: Date): SyncRequest | null {
  return h.db.transaction(
    (tx) => {
      const next = tx
        .select()
        .from(syncRequests)
        .where(eq(syncRequests.status, "pending"))
        .orderBy(asc(syncRequests.id))
        .limit(1)
        .get();
      if (next === undefined) return null;
      tx.update(syncRequests)
        .set({ status: "running", startedAt: iso(now) })
        .where(and(eq(syncRequests.id, next.id), eq(syncRequests.status, "pending")))
        .run();
      const claimed = tx.select().from(syncRequests).where(eq(syncRequests.id, next.id)).get();
      return claimed === undefined ? null : toRequest(claimed);
    },
    { behavior: "immediate" },
  );
}

export function complete(
  h: DbHandle,
  id: number,
  status: Extract<SyncRequestStatus, "done" | "failed">,
  error: string | null,
  now: Date,
): void {
  h.db
    .update(syncRequests)
    .set({ status, error, finishedAt: iso(now) })
    .where(eq(syncRequests.id, id))
    .run();
}

export function getRequest(h: DbHandle, id: number): SyncRequest | null {
  const row = h.db.select().from(syncRequests).where(eq(syncRequests.id, id)).get();
  return row === undefined ? null : toRequest(row);
}

/** Pending requests, oldest first. */
export function listPending(h: DbHandle): SyncRequest[] {
  return h.db
    .select()
    .from(syncRequests)
    .where(eq(syncRequests.status, "pending"))
    .orderBy(asc(syncRequests.id))
    .all()
    .map(toRequest);
}

/** ISO `requested_at` of the newest request for `job` (any status), or null. For API debounce. */
export function lastRequestAt(h: DbHandle, job: SyncRequest["job"]): string | null {
  const row = h.db
    .select({ at: max(syncRequests.requestedAt) })
    .from(syncRequests)
    .where(eq(syncRequests.job, job))
    .get();
  return row?.at ?? null;
}

// ---------- sync lease ----------

const LeaseSchema = z.object({ holder: z.string(), expiresAtMs: z.number() });
export interface Lease {
  holder: string;
  /** ms epoch. */
  expiresAtMs: number;
}

/**
 * Why the lease is race-free across processes: each operation runs in a `BEGIN IMMEDIATE`
 * transaction, which takes SQLite's single write lock before the first read. A second process
 * trying to start its own IMMEDIATE transaction waits (up to `busy_timeout`) until the first
 * commits, so the read-decide-write sequence is serialized and never interleaves.
 */
function leaseTx<T>(
  h: DbHandle,
  fn: (current: Lease | null) => { next: Lease | "delete" | null; result: T },
): T {
  return h.db.transaction(
    (tx) => {
      const row = tx
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, SETTING_LEASE))
        .get();
      const current = parseJson(row?.value ?? null, LeaseSchema);
      const { next, result } = fn(current);
      if (next === "delete") {
        tx.delete(appSettings).where(eq(appSettings.key, SETTING_LEASE)).run();
      } else if (next !== null) {
        const value = JSON.stringify(next);
        tx.insert(appSettings)
          .values({ key: SETTING_LEASE, value })
          .onConflictDoUpdate({ target: appSettings.key, set: { value } })
          .run();
      }
      return result;
    },
    { behavior: "immediate" },
  );
}

/** Succeeds when no lease exists, it expired, or `holder` already holds it. */
export function acquireLease(h: DbHandle, holder: string, ttlMs: number, now: Date): boolean {
  const nowMs = now.getTime();
  return leaseTx(h, (cur) => {
    if (cur === null || cur.expiresAtMs <= nowMs || cur.holder === holder) {
      return { next: { holder, expiresAtMs: nowMs + ttlMs }, result: true };
    }
    return { next: null, result: false };
  });
}

/**
 * Extends the lease if `holder` still holds it. False when another holder took it or it is gone.
 * An expired lease that nobody else took is still renewable by its holder.
 */
export function renewLease(h: DbHandle, holder: string, ttlMs: number, now: Date): boolean {
  const nowMs = now.getTime();
  return leaseTx(h, (cur) => {
    if (cur !== null && cur.holder === holder) {
      return { next: { holder, expiresAtMs: nowMs + ttlMs }, result: true };
    }
    return { next: null, result: false };
  });
}

/** Releases the lease only if `holder` holds it. Returns whether it was released. */
export function releaseLease(h: DbHandle, holder: string): boolean {
  return leaseTx(h, (cur) =>
    cur !== null && cur.holder === holder
      ? { next: "delete", result: true }
      : { next: null, result: false },
  );
}

export function readLease(h: DbHandle): Lease | null {
  return parseJson(getSetting(h, SETTING_LEASE), LeaseSchema);
}

// ---------- /players/nfl guard ----------

/** ISO time of the last successful `/players/nfl` fetch, or null. */
export function readPlayersFetchedAt(h: DbHandle): string | null {
  return getSetting(h, SETTING_PLAYERS_FETCHED_AT);
}

export function writePlayersFetchedAt(h: DbHandle, now: Date): void {
  setSetting(h, SETTING_PLAYERS_FETCHED_AT, iso(now));
}
