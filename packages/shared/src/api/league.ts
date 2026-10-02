import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";

export const LeagueOverviewSchema = z.strictObject({
  leagueId: z.string(),
  name: z.string(),
  season: z.number().int(),
  /** As Sleeper returns it: pre_draft, drafting, in_season, complete. */
  status: z.string(),
  /** From nfl state; null when state has not synced. */
  currentWeek: z.number().int().nullable(),
  totalRosters: z.number().int(),
  rosterPositions: z.array(z.string()),
  playoffWeekStart: z.number().int().nullable(),
  waiverType: z.number().int().nullable(),
  hasDivisions: z.boolean(),
  freshness: FreshnessSchema,
});
export type LeagueOverview = z.infer<typeof LeagueOverviewSchema>;

/**
 * Standings sort (ADR-009 item 10): wins desc, then ties desc, then points for desc, then rosterId
 * asc as the final deterministic key (see `compareStandings`).
 * `rank` is the 1-based position after that sort. `teamName` falls back to the manager display
 * name, then "Team {rosterId}". Names are untrusted text.
 */
export const StandingsRowSchema = z.strictObject({
  rosterId: z.number().int(),
  ownerId: z.string().nullable(),
  teamName: z.string(),
  managerName: z.string().nullable(),
  avatar: z.string().nullable(),
  wins: z.number().int(),
  losses: z.number().int(),
  ties: z.number().int(),
  pointsFor: z.number(),
  pointsAgainst: z.number(),
  rank: z.number().int(),
  division: z.number().int().nullable(),
  isMine: z.boolean(),
});
export type StandingsRow = z.infer<typeof StandingsRowSchema>;

/** Comparator implementing the standings sort. Pure; total order since rosterId is unique. */
export function compareStandings(
  a: Pick<StandingsRow, "rosterId" | "wins" | "ties" | "pointsFor">,
  b: Pick<StandingsRow, "rosterId" | "wins" | "ties" | "pointsFor">,
): number {
  return b.wins - a.wins || b.ties - a.ties || b.pointsFor - a.pointsFor || a.rosterId - b.rosterId;
}

export const StandingsResponseSchema = z.strictObject({
  rows: z.array(StandingsRowSchema),
  freshness: FreshnessSchema,
});
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;

export const TeamPlayerSlotSchema = z.enum(["starter", "bench", "ir", "taxi"]);
export type TeamPlayerSlot = z.infer<typeof TeamPlayerSlotSchema>;

/**
 * `starterSlot` is the league roster position label (QB, RB, FLEX, ...) for starters, null for
 * others. Empty lineup slots (Sleeper's "0" in starters) are not player rows: their labels are
 * listed in TeamDetail.emptySlots.
 */
export const TeamPlayerRowSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  fantasyPositions: z.array(z.string()),
  nflTeam: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  injuryBodyPart: z.string().nullable(),
  byeWeek: z.number().int().nullable(),
  slot: TeamPlayerSlotSchema,
  starterSlot: z.string().nullable(),
});
export type TeamPlayerRow = z.infer<typeof TeamPlayerRowSchema>;

export const TeamDetailSchema = z.strictObject({
  roster: StandingsRowSchema,
  players: z.array(TeamPlayerRowSchema),
  emptySlots: z.array(z.string()),
  freshness: FreshnessSchema,
});
export type TeamDetail = z.infer<typeof TeamDetailSchema>;

export const PlayerSearchRequestSchema = z.strictObject({
  q: z.string().trim().min(2).max(40),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
export type PlayerSearchRequest = z.infer<typeof PlayerSearchRequestSchema>;

export const PlayerSearchResultSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  owner: z.strictObject({ rosterId: z.number().int(), teamName: z.string() }).nullable(),
});
export type PlayerSearchResult = z.infer<typeof PlayerSearchResultSchema>;
