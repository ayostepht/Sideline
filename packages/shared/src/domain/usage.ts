import { z } from "zod";

const n = z.number().nullable();

/** Weekly usage from nflverse. Shares and `snapPct` are fractions 0 to 1 (null when unavailable). */
export const UsageWeekSchema = z.strictObject({
  season: z.number().int(),
  week: z.number().int(),
  playerId: z.string(),
  team: z.string().nullable(),
  snapPct: n,
  targets: n,
  targetShare: n,
  airYardsShare: n,
  carries: n,
  carryShare: n,
  rzTouches: n,
});
export type UsageWeek = z.infer<typeof UsageWeekSchema>;
