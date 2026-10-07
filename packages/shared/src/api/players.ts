import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";
import { ReasonSchema } from "../reason.js";

/**
 * T4.5c (PLAN 4.5, TREND-1..5): players list (paginated, filterable) and player detail DTOs.
 *
 * Pagination (first offset/page convention in this codebase; documented here since there is no
 * prior art to point to): 1-based `page` plus `pageSize`, following `PlayerSearchRequestSchema`'s
 * `z.coerce.number().int().min(...).max(...).default(...)` style. `PlayersListResponse.total` is
 * the full filtered count (not just this page) and `hasMore` is `page * pageSize < total`, so a UI
 * can render either "page 2 of N" or an infinite-scroll "load more" without a second request.
 */
export const PLAYERS_LIST_DEFAULT_PAGE_SIZE = 25;
export const PLAYERS_LIST_MAX_PAGE_SIZE = 100;

export const PlayersListRequestSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PLAYERS_LIST_MAX_PAGE_SIZE)
    .default(PLAYERS_LIST_DEFAULT_PAGE_SIZE),
  /** Exact, case-insensitive match against the player's primary `position`. */
  position: z.string().trim().min(1).max(10).optional(),
  /** Case-insensitive substring match against the player's full name. */
  q: z.string().trim().min(1).max(40).optional(),
});
export type PlayersListRequest = z.infer<typeof PlayersListRequestSchema>;

export const PlayerTrendSignalSchema = z.enum(["Rising", "Steady", "Falling"]);
export type PlayerTrendSignal = z.infer<typeof PlayerTrendSignalSchema>;

/**
 * One player row in the list view. Trend fields are TREND-1 (`computeScoringTrend`) only: usage,
 * consistency, and momentum are deferred to the detail view (see players.ts's module doc) to keep
 * list pages cheap at any page size. `signal` is TREND-4 from the points delta alone (no usage
 * delta available at list scope); null when the player has no games played yet.
 */
export const PlayerListItemSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  seasonPpg: z.number().nullable(),
  l3Ppg: z.number().nullable(),
  l3Delta: z.number().nullable(),
  gamesPlayed: z.number().int(),
  signal: PlayerTrendSignalSchema.nullable(),
});
export type PlayerListItem = z.infer<typeof PlayerListItemSchema>;

export const PlayersListResponseSchema = z.strictObject({
  players: z.array(PlayerListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
  freshness: FreshnessSchema,
});
export type PlayersListResponse = z.infer<typeof PlayersListResponseSchema>;

// ---------- Player detail ----------

export const PlayerWeeklyPointSchema = z.strictObject({
  week: z.number().int(),
  actualPts: z.number(),
});
export type PlayerWeeklyPoint = z.infer<typeof PlayerWeeklyPointSchema>;

export const PlayerScoringTrendSchema = z.strictObject({
  seasonPpg: z.number().nullable(),
  l3Ppg: z.number().nullable(),
  l3Delta: z.number().nullable(),
  gamesPlayed: z.number().int(),
  weeklySeries: z.array(PlayerWeeklyPointSchema),
  reasons: z.array(ReasonSchema),
});
export type PlayerScoringTrend = z.infer<typeof PlayerScoringTrendSchema>;

/** Mirrors TREND-2's `UsageFieldKey` (`packages/core/src/trends/usage-trend.ts`), duplicated here
 * since `packages/shared` has no dependency on `packages/core` (zod only). */
export const PlayerUsageFieldSchema = z.enum([
  "snapPct",
  "targetShare",
  "airYardsShare",
  "carryShare",
  "rzTouches",
]);
export type PlayerUsageField = z.infer<typeof PlayerUsageFieldSchema>;

export const PlayerUsageFieldTrendSchema = z.strictObject({
  field: PlayerUsageFieldSchema,
  l3Value: z.number().nullable(),
  priorValue: z.number().nullable(),
  delta: z.number().nullable(),
});
export type PlayerUsageFieldTrend = z.infer<typeof PlayerUsageFieldTrendSchema>;

export const PlayerUsageTrendSchema = z.strictObject({
  fields: z.array(PlayerUsageFieldTrendSchema),
  reasons: z.array(ReasonSchema),
});
export type PlayerUsageTrend = z.infer<typeof PlayerUsageTrendSchema>;

export const PlayerConsistencyWeekSchema = z.strictObject({
  week: z.number().int(),
  actualPts: z.number(),
  positionRank: z.number().int(),
  isBoom: z.boolean(),
  isBust: z.boolean(),
});
export type PlayerConsistencyWeek = z.infer<typeof PlayerConsistencyWeekSchema>;

export const PlayerConsistencySchema = z.strictObject({
  cv: z.number(),
  weeks: z.array(PlayerConsistencyWeekSchema),
  boomCount: z.number().int(),
  bustCount: z.number().int(),
  /** `N`, the number of startable players at this player's position league-wide (TREND-3), used
   * to compute the boom/bust thresholds above. 0 when the player has no known position. */
  startableCount: z.number().int(),
  reasons: z.array(ReasonSchema),
});
export type PlayerConsistency = z.infer<typeof PlayerConsistencySchema>;

export const PlayerMomentumLabelSchema = z.enum(["Hot", "Warm", "Neutral", "Cold"]);
export type PlayerMomentumLabel = z.infer<typeof PlayerMomentumLabelSchema>;

export const PlayerMomentumSchema = z.strictObject({
  addCount: z.number().int(),
  dropCount: z.number().int(),
  netCount: z.number().int(),
  label: PlayerMomentumLabelSchema,
  reasons: z.array(ReasonSchema),
});
export type PlayerMomentum = z.infer<typeof PlayerMomentumSchema>;

/** P7.4: one row of the player pop-up's weekly table, newest week first. */
export const PlayerWeekRowSchema = z.strictObject({
  week: z.number().int(),
  /** Opponent team abbreviation; null on a bye or when the schedule is unknown. */
  opponent: z.string().nullable(),
  /** Null on a bye or when the schedule is unknown. */
  isHome: z.boolean().nullable(),
  isBye: z.boolean(),
  /** League-scored points; null means no stats that week (did not play). */
  actualPts: z.number().nullable(),
  /** League-scored projection from the stored pre-kickoff snapshot; null when none. */
  projectedPts: z.number().nullable(),
  /** Rank at the player's position league-wide that week (1 = best); null without stats. */
  positionRank: z.number().int().nullable(),
  isBoom: z.boolean(),
  isBust: z.boolean(),
  /** True for the current week when it has partial stats. */
  inProgress: z.boolean(),
});
export type PlayerWeekRow = z.infer<typeof PlayerWeekRowSchema>;

/** "note" is a short player update with analysis (RotoWire style); "article" is a generic story. */
export const PlayerNewsKindSchema = z.enum(["note", "article"]);
export type PlayerNewsKind = z.infer<typeof PlayerNewsKindSchema>;

export const PlayerNewsItemSchema = z.strictObject({
  id: z.string(),
  kind: PlayerNewsKindSchema,
  headline: z.string(),
  summary: z.string().nullable(),
  /** http(s) only; anything else is mapped to null server-side. */
  url: z.string().nullable(),
  source: z.string(),
  publishedAt: z.string(),
});
export type PlayerNewsItem = z.infer<typeof PlayerNewsItemSchema>;

export const PlayerNewsSchema = z.strictObject({
  items: z.array(PlayerNewsItemSchema),
  /** Latest fetch time of any stored news for this player; null when never fetched. */
  lastFetchedAt: z.string().nullable(),
});
export type PlayerNews = z.infer<typeof PlayerNewsSchema>;

/** Response of POST /api/l/[leagueId]/players/[playerId]/news/refresh (HTTP 202). */
export const PlayerNewsRefreshResponseSchema = z.strictObject({ queued: z.boolean() });
export type PlayerNewsRefreshResponse = z.infer<typeof PlayerNewsRefreshResponseSchema>;

export const NextOpponentGradeSchema = z.enum(["A", "B", "C", "D", "F"]);
export type NextOpponentGrade = z.infer<typeof NextOpponentGradeSchema>;

/** One upcoming NFL week for the player's team. Grades are context only (ADR-014: projections are
 * not adjusted). An easy defense for the player's position gets a good grade (A). */
export const NextOpponentWeekSchema = z.strictObject({
  week: z.number().int(),
  bye: z.boolean(),
  /** Opponent NFL team code (nflverse style, e.g. "LA"); null on a bye. */
  opponent: z.string().nullable(),
  home: z.boolean().nullable(),
  grade: NextOpponentGradeSchema.nullable(),
  /** Plain-language label that always accompanies the grade, e.g. "Great matchup". */
  gradeLabel: z.string().nullable(),
  /** Fantasy points per game the opponent allows at this position (the number behind the grade). */
  ptsAllowedPg: z.number().nullable(),
  /** 1 = allows the most points at the position (easiest). */
  rank: z.number().int().nullable(),
  totalTeams: z.number().int().nullable(),
});
export type NextOpponentWeek = z.infer<typeof NextOpponentWeekSchema>;

export const NextOpponentsSchema = z.strictObject({
  weeks: z.array(NextOpponentWeekSchema),
  /** Short plain reason when no opponents are listed (no team, kicker or defense); else null. */
  reasonUnavailable: z.string().nullable(),
});
export type NextOpponents = z.infer<typeof NextOpponentsSchema>;

export const PlayerDetailResponseSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  fantasyPositions: z.array(z.string()),
  nflTeam: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  scoring: PlayerScoringTrendSchema,
  usage: PlayerUsageTrendSchema,
  consistency: PlayerConsistencySchema,
  /** TREND-4, from the scoring delta and (when relevant) the usage trend's `snapPct` delta - the
   * one usage field common to every tracked position (see players.ts's module doc). Null when the
   * player has no games played yet. */
  signal: PlayerTrendSignalSchema.nullable(),
  signalReasons: z.array(ReasonSchema),
  momentum: PlayerMomentumSchema,
  freshness: FreshnessSchema,
  /** P7.4 (optional in the type so existing literals compile; the server always sets all three).
   * Headshot URL from `playerHeadshotUrl`, null for a DEF without a team. */
  headshotUrl: z.string().nullable().optional(),
  /** Weeks 1 through the latest completed week (plus the current week if it has stats), newest first. */
  weekly: z.array(PlayerWeekRowSchema).optional(),
  news: PlayerNewsSchema.optional(),
  /** Next 4 opponents with matchup grades (optional in the type so existing literals compile;
   * the server always sets it). */
  nextOpponents: NextOpponentsSchema.optional(),
});
export type PlayerDetailResponse = z.infer<typeof PlayerDetailResponseSchema>;
