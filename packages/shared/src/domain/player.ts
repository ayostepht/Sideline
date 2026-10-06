import { z } from "zod";

/**
 * An NFL player from Sleeper `/players/nfl`. Fields Sleeper omits are null.
 * `team` is a Sleeper team code, null for free agents. `gsisId` is the nflverse join key.
 */
export const PlayerSchema = z.strictObject({
  playerId: z.string(),
  fullName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  position: z.string().nullable(),
  fantasyPositions: z.array(z.string()),
  team: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  injuryBodyPart: z.string().nullable(),
  active: z.boolean().nullable(),
  age: z.number().nullable(),
  yearsExp: z.number().nullable(),
  depthChartOrder: z.number().nullable(),
  searchRank: z.number().nullable(),
  gsisId: z.string().nullable(),
  /** ESPN athlete id. Optional: undefined or null leaves a stored value unchanged on upsert. */
  espnId: z.string().nullable().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;
