import { z } from "zod";
import { SeasonTypeSchema } from "./nfl-state.js";

const base = {
  season: z.number().int(),
  week: z.number().int(),
  seasonType: SeasonTypeSchema,
  playerId: z.string(),
  /** Sleeper stat key to value (for example "rec_yd"). */
  stats: z.record(z.string(), z.number()),
};

/** Actual stats for one player-week. */
export const PlayerWeekStatsSchema = z.strictObject({
  ...base,
  source: z.enum(["sleeper", "nflverse"]),
});
export type PlayerWeekStats = z.infer<typeof PlayerWeekStatsSchema>;

/** Projected stats for one player-week. `opponent` is a team code, null if unknown. `fetchedAt` is ISO 8601. */
export const PlayerWeekProjectionSchema = z.strictObject({
  ...base,
  opponent: z.string().nullable(),
  fetchedAt: z.string(),
  source: z.literal("sleeper"),
});
export type PlayerWeekProjection = z.infer<typeof PlayerWeekProjectionSchema>;
