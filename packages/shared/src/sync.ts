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

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

/**
 * Default refresh cadence per job in ms, outside game windows. Single source of truth for the
 * worker schedule and for API freshness flags (stale after 2x cadence). The worker's cron defaults
 * for players (04:30 ET) and nflverse (05:00 ET) are daily; game-window speedups are worker-local.
 * `null` means the job never recurs (one-time backfill).
 */
export const SYNC_CADENCE_MS: Record<SyncJobName, number | null> = {
  state: 15 * MIN_MS,
  league: HOUR_MS,
  users: HOUR_MS,
  rosters: 15 * MIN_MS,
  matchups: 15 * MIN_MS,
  transactions: 15 * MIN_MS,
  players: 24 * HOUR_MS,
  trending: 30 * MIN_MS,
  stats: HOUR_MS,
  projections: HOUR_MS,
  backfill_2025: null,
  nflverse: 24 * HOUR_MS,
};
