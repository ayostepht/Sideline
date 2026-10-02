import type { DbHandle } from "@sideline/db";
import type { NflState, SeasonType } from "@sideline/shared";

/**
 * Small read-only queries the jobs need. packages/db has no helper for these yet; they are
 * confined here so they can move there later (reported as a follow-up).
 */

export function readState(h: DbHandle): NflState | null {
  const r = h.sqlite
    .prepare(
      `SELECT season, week, season_type AS t, display_week AS d, leg, previous_season AS p,
              season_start_date AS s FROM nfl_state WHERE id = 1`,
    )
    .get() as
    | {
        season: number;
        week: number;
        t: string;
        d: number;
        leg: number;
        p: number | null;
        s: string | null;
      }
    | undefined;
  if (!r) return null;
  return {
    season: r.season,
    week: r.week,
    seasonType: r.t as SeasonType,
    displayWeek: r.d,
    leg: r.leg,
    previousSeason: r.p,
    seasonStartDate: r.s,
  };
}

export function readPlayoffWeekStart(h: DbHandle, leagueId: string): number | null {
  const r = h.sqlite
    .prepare("SELECT playoff_week_start AS p FROM leagues WHERE league_id = ?")
    .get(leagueId) as { p: number | null } | undefined;
  return r?.p ?? null;
}

export function storedMatchupWeeks(h: DbHandle, leagueId: string): Set<number> {
  const rows = h.sqlite
    .prepare("SELECT DISTINCT week FROM matchups WHERE league_id = ?")
    .all(leagueId) as { week: number }[];
  return new Set(rows.map((r) => r.week));
}

export function positionCounts(h: DbHandle): Map<string, number> {
  const rows = h.sqlite
    .prepare(
      "SELECT position AS p, COUNT(*) AS n FROM players WHERE position IS NOT NULL GROUP BY position",
    )
    .all() as { p: string; n: number }[];
  return new Map(rows.map((r) => [r.p, r.n]));
}

export function storedStatsWeeks(h: DbHandle, season: number, seasonType: SeasonType): Set<number> {
  const rows = h.sqlite
    .prepare(
      "SELECT DISTINCT week FROM player_week_stats WHERE season = ? AND season_type = ? AND source = 'sleeper'",
    )
    .all(season, seasonType) as { week: number }[];
  return new Set(rows.map((r) => r.week));
}

export function storedProjectionWeeks(
  h: DbHandle,
  season: number,
  seasonType: SeasonType,
): Set<number> {
  const rows = h.sqlite
    .prepare(
      "SELECT DISTINCT week FROM player_week_projections WHERE season = ? AND season_type = ?",
    )
    .all(season, seasonType) as { week: number }[];
  return new Set(rows.map((r) => r.week));
}

/** Sleeper uses LAR where nflverse (the schedule) uses LA (docs/sleeper-api-notes.md 14e). */
export function scheduleTeamCode(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}

/** Team code (schedule spelling) to kickoff ISO time for one week. Null kickoffs are omitted. */
export function kickoffsByTeam(h: DbHandle, season: number, week: number): Map<string, string> {
  const rows = h.sqlite
    .prepare(
      "SELECT home, away, kickoff_utc AS k FROM schedule WHERE season = ? AND week = ? AND kickoff_utc IS NOT NULL",
    )
    .all(season, week) as { home: string; away: string; k: string }[];
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(r.home, r.k);
    out.set(r.away, r.k);
  }
  return out;
}
