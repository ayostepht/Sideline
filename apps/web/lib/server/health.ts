import {
  deriveHealthStatus,
  deriveWorkerStatus,
  healthHttpStatus,
  HealthResponseSchema,
  type HealthResponse,
} from "@sideline/shared";
import { isMigrated, latestRunPerJob, readHeartbeat, type DbHandle } from "@sideline/db";
import pkg from "../../package.json";
import { getDb } from "./db";
import type { ApiResult } from "./http";

/** True when the worker heartbeat is fresh (same rule as health's worker status "ok"). */
export function isWorkerLive(h: DbHandle, now: Date): boolean {
  const hb = readHeartbeat(h);
  const at = hb === null ? Number.NaN : Date.parse(hb.at);
  return !Number.isNaN(at) && deriveWorkerStatus(at, now.getTime()) === "ok";
}

/** Builds the health payload. Never throws: any failure becomes status 'error'. */
export function getHealth(now: Date = new Date()): ApiResult {
  const base = { version: pkg.version, time: now.toISOString() };
  const failed = (error: string): ApiResult => {
    const body: HealthResponse = {
      status: "error",
      ...base,
      db: { ok: false, migrated: false, error },
      worker: { status: "never", lastHeartbeatAt: null },
      lastSync: null,
    };
    return { status: healthHttpStatus("error"), body: HealthResponseSchema.parse(body) };
  };
  try {
    const dbState = getDb();
    if (!dbState.ok) return failed(dbState.error);
    const handle = dbState.handle;
    const migrated = isMigrated(handle);
    let heartbeatMs: number | null = null;
    let lastSync: HealthResponse["lastSync"] = null;
    if (migrated) {
      const hb = readHeartbeat(handle);
      const parsed = hb === null ? Number.NaN : Date.parse(hb.at);
      heartbeatMs = Number.isNaN(parsed) ? null : parsed;
      const finished = latestRunPerJob(handle)
        .filter((r) => r.finishedAt !== null)
        .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
      lastSync = finished
        ? { job: finished.job, status: finished.status, finishedAt: finished.finishedAt }
        : null;
    } else {
      handle.sqlite.prepare("SELECT 1").get(); // confirms the file is queryable
    }
    const worker = {
      status: deriveWorkerStatus(heartbeatMs, now.getTime()),
      lastHeartbeatAt: heartbeatMs === null ? null : new Date(heartbeatMs).toISOString(),
    };
    const db = { ok: true, migrated };
    const status = deriveHealthStatus({ db, worker });
    const body: HealthResponse = { status, ...base, db, worker, lastSync };
    return { status: healthHttpStatus(status), body: HealthResponseSchema.parse(body) };
  } catch (err) {
    return failed(err instanceof Error ? err.message : "health check failed");
  }
}
