import { z } from "zod";

/**
 * A team's roster. Player id arrays hold Sleeper player ids.
 * `starters` may contain the string "0" for an empty lineup slot (Sleeper behavior, kept as-is).
 * `fpts` and `fptsAgainst` are decimals already combined from Sleeper's integer and `_decimal` parts
 * (366 + 28 -> 366.28). `ownerId` is null for orphaned teams.
 */
export const RosterSchema = z.strictObject({
  leagueId: z.string(),
  rosterId: z.number().int(),
  ownerId: z.string().nullable(),
  players: z.array(z.string()),
  starters: z.array(z.string()),
  reserve: z.array(z.string()),
  taxi: z.array(z.string()),
  wins: z.number().int(),
  losses: z.number().int(),
  ties: z.number().int(),
  fpts: z.number(),
  fptsAgainst: z.number(),
  /** 1 = first claim priority; null when unset. */
  waiverPosition: z.number().int().nullable(),
  waiverBudgetUsed: z.number(),
});
export type Roster = z.infer<typeof RosterSchema>;
