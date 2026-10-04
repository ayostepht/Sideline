import { z } from "zod";
import { ReasonSchema } from "../reason.js";
import { FreshnessSchema } from "./freshness.js";

/**
 * T5.4c (PLAN 5.8): response contract for `GET /api/l/{leagueId}/league-intelligence`, wiring
 * LEAGUE-1..LEAGUE-6 together: one row per team (all-play record, luck, power score, playoff odds,
 * manager tendencies) plus one flattened positional strength heatmap across every team and
 * position. No request params beyond the league id: unlike Matchup/Lineup/Waivers this view has no
 * "week" or "roster" axis, it is always "the whole league, right now".
 */

/** LEAGUE-1: one team's season all-play record. `weeklyWinRates` is ascending by week, over every
 * week counted as "played" (see the data function's doc for the cutoff). */
export const LeagueIntelligenceAllPlaySchema = z.strictObject({
  wins: z.number().int(),
  losses: z.number().int(),
  ties: z.number().int(),
  gamesPlayed: z.number().int(),
  winRate: z.number(),
  weeklyWinRates: z.array(z.number()),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligenceAllPlay = z.infer<typeof LeagueIntelligenceAllPlaySchema>;

/** LEAGUE-2: `luck = actualWins - expectedWins`; positive means winning more than the
 * schedule-neutral all-play record predicts. */
export const LeagueIntelligenceLuckSchema = z.strictObject({
  actualWins: z.number(),
  expectedWins: z.number(),
  luck: z.number(),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligenceLuck = z.infer<typeof LeagueIntelligenceLuckSchema>;

/** LEAGUE-3: the weighted "how good is this team really" composite. The three components are
 * echoed here (already normalized, see `POWER_SCORE_WEIGHTS` in `@sideline/core`) so the UI tooltip
 * can show the breakdown. */
export const LeagueIntelligencePowerScoreSchema = z.strictObject({
  score: z.number(),
  allPlayWinRate: z.number(),
  recentPointsForNormalized: z.number(),
  rosterStrengthNormalized: z.number(),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligencePowerScore = z.infer<typeof LeagueIntelligencePowerScoreSchema>;

/** One 1-based playoff seed and the fraction of simulated seasons this team finished there. */
export const LeagueIntelligenceSeedProbabilitySchema = z.strictObject({
  seed: z.number().int(),
  probability: z.number(),
});
export type LeagueIntelligenceSeedProbability = z.infer<
  typeof LeagueIntelligenceSeedProbabilitySchema
>;

/** LEAGUE-5: Monte Carlo playoff odds. `byePct` is null when the league models no first-round bye
 * (this codebase has no bye-count data source yet, see the data function's doc; always null today).
 * `seedDistribution` sums to 1 across every seed. `reasons` is a season-level signal (identical
 * across every team in a given response, e.g. `LEAGUE_PLAYOFF_ODDS_NO_REMAINING_GAMES` when there
 * are no games left to simulate), not a per-team one; see `simulatePlayoffOdds`'s own doc comment
 * in `@sideline/core`. */
export const LeagueIntelligencePlayoffOddsSchema = z.strictObject({
  playoffPct: z.number(),
  byePct: z.number().nullable(),
  seedDistribution: z.array(LeagueIntelligenceSeedProbabilitySchema),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligencePlayoffOdds = z.infer<typeof LeagueIntelligencePlayoffOddsSchema>;

/** LEAGUE-6: transaction/trade/waiver-claim counts; FAAB fields are null for every team in a
 * non-FAAB league. */
export const LeagueIntelligenceManagerTendenciesSchema = z.strictObject({
  transactionCount: z.number().int(),
  waiverClaimsWon: z.number().int(),
  tradeCount: z.number().int(),
  faabSpent: z.number().nullable(),
  faabRemaining: z.number().nullable(),
  faabAverageWinningBid: z.number().nullable(),
  faabMaxWinningBid: z.number().nullable(),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligenceManagerTendencies = z.infer<
  typeof LeagueIntelligenceManagerTendenciesSchema
>;

/** One team's full league-intelligence row. `playoffOdds` is null when the league's playoff spot
 * count is unknown (not yet synced), since LEAGUE-5 cannot run without it. */
export const LeagueIntelligenceTeamSchema = z.strictObject({
  rosterId: z.number().int(),
  teamName: z.string(),
  allPlay: LeagueIntelligenceAllPlaySchema,
  luck: LeagueIntelligenceLuckSchema,
  powerScore: LeagueIntelligencePowerScoreSchema,
  playoffOdds: LeagueIntelligencePlayoffOddsSchema.nullable(),
  managerTendencies: LeagueIntelligenceManagerTendenciesSchema,
});
export type LeagueIntelligenceTeam = z.infer<typeof LeagueIntelligenceTeamSchema>;

/** LEAGUE-4: one team's ROS projected total at one position versus the league median there. */
export const LeagueIntelligenceHeatmapEntrySchema = z.strictObject({
  rosterId: z.number().int(),
  position: z.string(),
  value: z.number(),
  median: z.number(),
  delta: z.number(),
  ratio: z.number().nullable(),
  reasons: z.array(ReasonSchema),
});
export type LeagueIntelligenceHeatmapEntry = z.infer<typeof LeagueIntelligenceHeatmapEntrySchema>;

export const LeagueIntelligenceResponseSchema = z.strictObject({
  leagueId: z.string(),
  teams: z.array(LeagueIntelligenceTeamSchema),
  positionalHeatmap: z.array(LeagueIntelligenceHeatmapEntrySchema),
  /** The league's configured playoff spot count; null when unknown (not yet synced). Every
   * team's `playoffOdds` is null exactly when this is null. */
  playoffTeams: z.number().int().nullable(),
  /** Always 0 today: no first-round-bye data source exists yet (see the data function's doc). */
  firstRoundByeCount: z.number().int(),
  freshness: FreshnessSchema,
});
export type LeagueIntelligenceResponse = z.infer<typeof LeagueIntelligenceResponseSchema>;
