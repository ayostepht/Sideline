import { z } from "zod";

export const SYNC_JOB_NAMES = [
  "state",
  "league",
  "users",
  "rosters",
  "matchups",
  "transactions",
  "players",
  "player_ids",
  "trending",
  "stats",
  "projections",
  "backfill_2025",
  "nflverse",
  "player_news",
  "weather",
] as const;
export const SyncJobNameSchema = z.enum(SYNC_JOB_NAMES);
export type SyncJobName = (typeof SYNC_JOB_NAMES)[number];

/**
 * Onboarding jobs (ADR-009). Deliberately NOT part of SYNC_JOB_NAMES: they take params, never run
 * on a schedule, and must not appear in "all" runs or the status list.
 */
export const ONBOARDING_JOB_NAMES = ["user", "user_leagues"] as const;
export const OnboardingJobNameSchema = z.enum(ONBOARDING_JOB_NAMES);
export type OnboardingJobName = (typeof ONBOARDING_JOB_NAMES)[number];

/** Sleeper usernames: letters, digits, underscore, period. Trimmed, 1 to 40 chars. */
export const SleeperUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_.]+$/, "Usernames use letters, numbers, underscores and periods");

/** Username is trimmed then lowercased (Sleeper usernames are case-insensitive) so dedupe matches. */
export const UserJobParamsSchema = z.strictObject({
  username: SleeperUsernameSchema.toLowerCase(),
});
export type UserJobParams = z.infer<typeof UserJobParamsSchema>;
export const UserLeaguesJobParamsSchema = z.strictObject({
  userId: z.string().min(1),
  season: z.number().int(),
});
export type UserLeaguesJobParams = z.infer<typeof UserLeaguesJobParamsSchema>;

/** Params per onboarding job. Scheduled jobs carry none. */
export const SyncRequestParamsSchema = z.union([UserJobParamsSchema, UserLeaguesJobParamsSchema]);
export type SyncRequestParams = z.infer<typeof SyncRequestParamsSchema>;

/** Validates params for a given job; null params for jobs that take none. Returns null if invalid. */
export function parseParamsForJob(job: string, raw: unknown): SyncRequestParams | null {
  if (job === "user") {
    const r = UserJobParamsSchema.safeParse(raw);
    return r.success ? r.data : null;
  }
  if (job === "user_leagues") {
    const r = UserLeaguesJobParamsSchema.safeParse(raw);
    return r.success ? r.data : null;
  }
  return null;
}

/** Any job name a sync request may carry. */
export const SyncRequestJobSchema = z.union([
  SyncJobNameSchema,
  z.literal("all"),
  OnboardingJobNameSchema,
]);
export type SyncRequestJob = z.infer<typeof SyncRequestJobSchema>;

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
  job: SyncRequestJobSchema,
  /** Onboarding jobs only; absent or null otherwise. */
  params: SyncRequestParamsSchema.nullable().optional(),
  /** Set when stored params are missing or fail validation for an onboarding job; the worker should fail the request with it. */
  paramsError: z.string().optional(),
  requestedAt: z.string(),
  status: SyncRequestStatusSchema,
  source: z.enum(["api", "cli"]),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  /** Optional job target (a player id for "player_news"); absent or null otherwise. */
  target: z.string().nullable().optional(),
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
  player_ids: 24 * HOUR_MS,
  trending: 30 * MIN_MS,
  stats: HOUR_MS,
  projections: HOUR_MS,
  backfill_2025: null,
  nflverse: 24 * HOUR_MS,
  player_news: 30 * MIN_MS,
  weather: 3 * HOUR_MS,
};
