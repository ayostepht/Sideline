import { z } from "zod";
import { SyncJobNameSchema, SyncRunStatusSchema } from "../sync.js";

/** Worker heartbeat older than this (ms) is stale. */
export const WORKER_STALE_AFTER_MS = 2 * 60 * 1000;

/**
 * HTTP contract (HOST-3): 200 for "ok" and "degraded", 503 for "error" (DB cannot be opened or queried).
 * DTO schemas are strict: they are our own responses, so unexpected keys indicate a bug.
 */
export const HealthResponseSchema = z.strictObject({
  status: z.enum(["ok", "degraded", "error"]),
  version: z.string(),
  /** ISO 8601 server time. */
  time: z.string(),
  db: z.strictObject({
    ok: z.boolean(),
    migrated: z.boolean(),
    error: z.string().optional(),
  }),
  worker: z.strictObject({
    status: z.enum(["ok", "stale", "never"]),
    /** ISO 8601, null if the worker never reported. */
    lastHeartbeatAt: z.string().nullable(),
  }),
  /** True when SIDELINE_GAME_CLOCK pins the football clock. Boolean only; the value is not exposed. */
  gameClockPinned: z.boolean().default(false),
  lastSync: z
    .strictObject({
      job: SyncJobNameSchema,
      status: SyncRunStatusSchema,
      finishedAt: z.string().nullable(),
    })
    .nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type HealthStatus = HealthResponse["status"];
export type WorkerHealthStatus = HealthResponse["worker"]["status"];

/** Pure: worker status from heartbeat ms epoch (null = never) and `nowMs`. */
export function deriveWorkerStatus(
  lastHeartbeatMs: number | null,
  nowMs: number,
  staleAfterMs: number = WORKER_STALE_AFTER_MS,
): WorkerHealthStatus {
  if (lastHeartbeatMs === null) return "never";
  return nowMs - lastHeartbeatMs > staleAfterMs ? "stale" : "ok";
}

/** Pure: overall status. DB not ok -> error; not migrated or worker never/stale -> degraded; else ok. */
export function deriveHealthStatus(input: {
  db: { ok: boolean; migrated: boolean };
  worker: { status: WorkerHealthStatus };
}): HealthStatus {
  if (!input.db.ok) return "error";
  if (!input.db.migrated) return "degraded";
  if (input.worker.status !== "ok") return "degraded";
  return "ok";
}

/** HTTP status for a health status. */
export function healthHttpStatus(status: HealthStatus): 200 | 503 {
  return status === "error" ? 503 : 200;
}
