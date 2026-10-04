import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";

/**
 * SIM-1/SIM-2 (PLAN 5.7, T5.4b): request/response contracts for `GET /api/l/{leagueId}/matchup`.
 * `week` defaults to the current NFL week; `roster` overrides "my" roster (defaults to the stored
 * Sleeper user's team), matching `LineupRequestSchema`/`WaiverRequestSchema`'s conventions.
 */
export const MatchupRequestSchema = z.strictObject({
  week: z.coerce.number().int().min(1).max(18).optional(),
  roster: z.coerce.number().int().optional(),
});
export type MatchupRequest = z.infer<typeof MatchupRequestSchema>;

/** One side of the simulated matchup: this roster's identity and simulated score distribution. */
export const MatchupTeamSchema = z.strictObject({
  rosterId: z.number().int(),
  teamName: z.string(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
});
export type MatchupTeam = z.infer<typeof MatchupTeamSchema>;

/** SIM-2: one starter's contribution to the uncertainty in the score differential. */
export const MatchupSwingPlayerSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  rosterId: z.number().int(),
  varianceContribution: z.number(),
});
export type MatchupSwingPlayer = z.infer<typeof MatchupSwingPlayerSchema>;

/**
 * SIM-1/SIM-2: this week's head-to-head simulation for one roster. `team` is the requested
 * roster (or the stored user's); `opponent` is whoever they are paired against this week.
 * `swingPlayers` is descending by `varianceContribution` across every starter on both sides.
 */
export const MatchupResponseSchema = z.strictObject({
  leagueId: z.string(),
  week: z.number().int(),
  team: MatchupTeamSchema,
  opponent: MatchupTeamSchema,
  winProbability: z.number(),
  opponentWinProbability: z.number(),
  tieProbability: z.number(),
  swingPlayers: z.array(MatchupSwingPlayerSchema),
  freshness: FreshnessSchema,
});
export type MatchupResponse = z.infer<typeof MatchupResponseSchema>;
