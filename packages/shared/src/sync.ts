import { z } from "zod";

export const SYNC_JOB_NAMES = [
  "state",
  "league",
  "users",
  "rosters",
  "matchups",
  "transactions",
  "players",
  "trending",
  "stats",
  "projections",
  "backfill_2025",
  "nflverse",
] as const;
export const SyncJobNameSchema = z.enum(SYNC_JOB_NAMES);
export type SyncJobName = (typeof SYNC_JOB_NAMES)[number];

export const SyncRunStatusSchema = z.enum(["running", "success", "failed", "skipped"]);
export type SyncRunStatus = z.infer<typeof SyncRunStatusSchema>;

/** One job execution. `startedAt`/`finishedAt` are ISO 8601; `finishedAt` null while running. */
export const SyncRunSchema = z.strictObject({
  id: z.number().int(),
  job: SyncJobNameSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: SyncRunStatusSchema,
  callsMade: z.number().int(),
  rowsChanged: z.number().int(),
  error: z.string().nullable(),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

export const SyncRequestStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type SyncRequestStatus = z.infer<typeof SyncRequestStatusSchema>;

/** A manual sync queued for the worker. Timestamps are ISO 8601; started/finished null until reached. */
export const SyncRequestSchema = z.strictObject({
  id: z.number().int(),
  job: z.union([SyncJobNameSchema, z.literal("all")]),
  requestedAt: z.string(),
  status: SyncRequestStatusSchema,
  source: z.enum(["api", "cli"]),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
