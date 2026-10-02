import { z } from "zod";

/**
 * One roster's side of a weekly matchup. `matchupId` pairs two rosters; null when on a bye or
 * not yet scheduled. Points are decimals in the league's scoring. `startersPoints` is parallel to
 * `starters`; `playersPoints` maps player id to points.
 */
export const MatchupSchema = z.strictObject({
  leagueId: z.string(),
  week: z.number().int(),
  rosterId: z.number().int(),
  matchupId: z.number().int().nullable(),
  starters: z.array(z.string()),
  startersPoints: z.array(z.number()),
  players: z.array(z.string()),
  playersPoints: z.record(z.string(), z.number()),
  points: z.number(),
});
export type Matchup = z.infer<typeof MatchupSchema>;
