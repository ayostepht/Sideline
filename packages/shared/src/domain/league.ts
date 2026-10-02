import { z } from "zod";

/**
 * How waivers resolve, derived from Sleeper `settings.waiver_type` (ADR-002 item 7):
 * 0 rolling (verified), 1 reverse standings and 2 FAAB (medium-low confidence), else unknown.
 */
export const WaiverModeSchema = z.enum(["rolling", "faab", "reverse_standings", "unknown"]);
export type WaiverMode = z.infer<typeof WaiverModeSchema>;

/** Pure mapping from Sleeper `waiver_type` code to {@link WaiverMode}. Unknown codes give "unknown". */
export function deriveWaiverMode(waiverType: number | null | undefined): WaiverMode {
  switch (waiverType) {
    case 0:
      return "rolling";
    case 1:
      return "reverse_standings";
    case 2:
      return "faab";
    default:
      return "unknown";
  }
}

/**
 * A league (one season). All settings subset fields are nullable when Sleeper omits them.
 * `scoringSettings` maps Sleeper stat keys (for example "rec") to points per unit.
 * `settings` is the raw numeric settings passthrough.
 */
export const LeagueSchema = z.strictObject({
  leagueId: z.string(),
  season: z.number().int(),
  name: z.string(),
  status: z.string(),
  /** Previous season's league id; null for a first-season league. */
  previousLeagueId: z.string().nullable(),
  totalRosters: z.number().int(),
  rosterPositions: z.array(z.string()),
  scoringSettings: z.record(z.string(), z.number()),
  playoffWeekStart: z.number().int().nullable(),
  playoffTeams: z.number().int().nullable(),
  /** Last week trades are allowed; null when none. */
  tradeDeadline: z.number().int().nullable(),
  waiverType: z.number().int().nullable(),
  waiverMode: WaiverModeSchema,
  /** 0 = Monday (ADR-002). Null when unset. */
  waiverDayOfWeek: z.number().int().nullable(),
  /** Days dropped players stay on waivers. */
  waiverClearDays: z.number().int().nullable(),
  dailyWaivers: z.boolean(),
  /** FAAB budget; present even when unused. */
  waiverBudget: z.number().nullable(),
  divisions: z.number().int().nullable(),
  reserveSlots: z.number().int(),
  taxiSlots: z.number().int(),
  leagueAverageMatch: z.boolean(),
  settings: z.record(z.string(), z.number()),
});
export type League = z.infer<typeof LeagueSchema>;

/**
 * A manager in a league. `displayName` and `teamName` are untrusted user text.
 * `teamName` is null when the manager never set one.
 */
export const LeagueUserSchema = z.strictObject({
  leagueId: z.string(),
  userId: z.string(),
  displayName: z.string(),
  teamName: z.string().nullable(),
  avatar: z.string().nullable(),
});
export type LeagueUser = z.infer<typeof LeagueUserSchema>;
