import { z } from "zod";

/** Sleeper trending add/drop count. `fetchedAt` is ISO 8601. */
export const TrendingEntrySchema = z.strictObject({
  playerId: z.string(),
  type: z.enum(["add", "drop"]),
  count: z.number().int(),
  lookbackHours: z.number().int(),
  fetchedAt: z.string(),
});
export type TrendingEntry = z.infer<typeof TrendingEntrySchema>;
