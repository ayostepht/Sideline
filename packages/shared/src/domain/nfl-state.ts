import { z } from "zod";

/** Season phase as reported by Sleeper `/state/nfl`. */
export const SeasonTypeSchema = z.enum(["pre", "regular", "post", "off"]);
export type SeasonType = z.infer<typeof SeasonTypeSchema>;

/**
 * Normalized NFL calendar state. Strict object: this is our own model, not raw Sleeper JSON.
 * `seasonStartDate` is an ISO date string (YYYY-MM-DD).
 */
export const NflStateSchema = z.strictObject({
  season: z.number().int(),
  week: z.number().int(),
  seasonType: SeasonTypeSchema,
  displayWeek: z.number().int(),
  /** The `leg` Sleeper uses for league matchups and transactions endpoints. */
  leg: z.number().int(),
  previousSeason: z.number().int().nullable(),
  seasonStartDate: z.string().nullable(),
});
export type NflState = z.infer<typeof NflStateSchema>;
