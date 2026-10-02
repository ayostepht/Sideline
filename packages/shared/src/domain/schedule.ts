import { z } from "zod";

/**
 * An NFL game. `kickoffUtc` is ISO 8601 UTC, null if unknown; `kickoffApproximate` is true when it
 * is only a day-level estimate. Lines and scores are null before they exist.
 */
export const ScheduleGameSchema = z.strictObject({
  season: z.number().int(),
  week: z.number().int(),
  gameId: z.string(),
  gameType: z.string(),
  home: z.string(),
  away: z.string(),
  kickoffUtc: z.string().nullable(),
  kickoffApproximate: z.boolean(),
  roof: z.string().nullable(),
  /** Spread from the home team's perspective. */
  spreadLine: z.number().nullable(),
  totalLine: z.number().nullable(),
  homeScore: z.number().nullable(),
  awayScore: z.number().nullable(),
});
export type ScheduleGame = z.infer<typeof ScheduleGameSchema>;
