/**
 * SCORE-2 (PLAN 5.1): proves `scoreStatLine` matches Sleeper's own `players_points` on real
 * league data, strictly offline (reads the already-synced SQLite database; no network calls).
 *
 * Method: for every "completed" week, for every player who appears in that week's
 * `matchups.players_points_json` (starters and bench), recompute the league-scored points from
 * that player's `player_week_stats` row and compare to Sleeper's stored value. A missing stats
 * row counts as computed 0 (PLAN 5.1). Diff <= {@link MATCH_EPSILON} counts as a match.
 *
 * "Completed" weeks are weeks strictly before the current NFL week (`nfl_state.week`), or
 * `opts.throughWeek` when given. The `throughWeek` override exists because `nfl_state` reflects
 * whatever season the worker last synced, which will not match a fixture-seeded league's season
 * during manual or test runs (ADR-000 item 9 excludes partial weeks from SCORE-2 entirely, so a
 * caller validating a fixture league must say explicitly which weeks are complete).
 *
 * This module does only SQL reads through the given `DbHandle.sqlite` (no drizzle-orm query
 * builder, so it has no runtime dependency beyond the connection it is handed) plus
 * `@sideline/core`'s pure `scoreStatLine`.
 */
import { z } from "zod";
import { scoreStatLine } from "../../packages/core/src/index.js";
import type { DbHandle } from "../../packages/db/src/index.js";

/** Sleeper's own `players_points` and our recompute must agree within this many points. */
export const MATCH_EPSILON = 0.01;

/** Cap on how many individual mismatches a report carries in full (the tally covers the rest). */
export const MAX_REPORTED_MISMATCHES = 50;

/** SCORE-2 only validates the regular season; playoff/preseason scoring is out of scope. */
export const VALIDATED_SEASON_TYPE = "regular";

/** Stats source checked: Sleeper's own recorded stats (matches what players_points was computed from). */
export const VALIDATED_SOURCE = "sleeper";

const statsRecordSchema = z.record(z.string(), z.number());

export interface ScoringMismatch {
  playerId: string;
  week: number;
  expected: number;
  computed: number;
  diff: number;
}

export interface SuspectStatKey {
  key: string;
  count: number;
}

export interface ValidationReport {
  leagueId: string;
  season: number;
  weeksChecked: number[];
  totalPlayerWeeks: number;
  matchCount: number;
  /** 0 to 1. 1 when there is nothing to check (no player-weeks found for the given weeks). */
  matchRate: number;
  /** Full count of mismatches found, which may exceed `mismatches.length`. */
  mismatchCount: number;
  /** First `MAX_REPORTED_MISMATCHES` mismatches, in the order found. */
  mismatches: ScoringMismatch[];
  /** Scoring-settings keys missing from a mismatched player's stats row, tallied across all
   * mismatches and sorted by count descending (a hint at which key is under-covered). */
  suspectStatKeys: SuspectStatKey[];
}

export interface ValidateScoringOptions {
  /** Inclusive upper bound of weeks to check (1..throughWeek). Overrides `nfl_state`. */
  throughWeek?: number;
}

interface LeagueRow {
  season: number;
  scoringJson: string;
}

function readLeague(h: DbHandle, leagueId: string): LeagueRow {
  const row = h.sqlite
    .prepare("SELECT season, scoring_json AS scoringJson FROM leagues WHERE league_id = ?")
    .get(leagueId) as LeagueRow | undefined;
  if (row === undefined) {
    throw new Error(`no league "${leagueId}" in the leagues table; sync it first`);
  }
  return row;
}

function parseScoringSettings(json: string): Record<string, number> {
  const parsed = statsRecordSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new Error(`leagues.scoring_json is not a flat number record: ${parsed.error.message}`);
  }
  return parsed.data;
}

function readNflStateWeek(h: DbHandle): number | null {
  const row = h.sqlite.prepare("SELECT week FROM nfl_state WHERE id = 1").get() as
    { week: number } | undefined;
  return row?.week ?? null;
}

/** 1..n inclusive; [] when n < 1. */
function upTo(n: number): number[] {
  const weeks: number[] = [];
  for (let w = 1; w <= n; w += 1) weeks.push(w);
  return weeks;
}

function completedWeeks(h: DbHandle, opts: ValidateScoringOptions | undefined): number[] {
  if (opts?.throughWeek !== undefined) return upTo(opts.throughWeek);
  const currentWeek = readNflStateWeek(h);
  if (currentWeek === null) return [];
  return upTo(currentWeek - 1);
}

interface MatchupRow {
  playersPointsJson: string;
}

function readMatchupRows(h: DbHandle, leagueId: string, week: number): MatchupRow[] {
  return h.sqlite
    .prepare(
      "SELECT players_points_json AS playersPointsJson FROM matchups WHERE league_id = ? AND week = ?",
    )
    .all(leagueId, week) as MatchupRow[];
}

function parsePlayersPoints(json: string): Record<string, number> {
  const parsed = statsRecordSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new Error(
      `matchups.players_points_json is not a flat number record: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function readPlayerStats(
  h: DbHandle,
  season: number,
  week: number,
  playerId: string,
): Record<string, number> | undefined {
  const row = h.sqlite
    .prepare(
      "SELECT stats_json AS statsJson FROM player_week_stats " +
        "WHERE season = ? AND season_type = ? AND week = ? AND player_id = ? AND source = ?",
    )
    .get(season, VALIDATED_SEASON_TYPE, week, playerId, VALIDATED_SOURCE) as
    { statsJson: string } | undefined;
  if (row === undefined) return undefined;
  const parsed = statsRecordSchema.safeParse(JSON.parse(row.statsJson));
  if (!parsed.success) {
    throw new Error(
      `player_week_stats.stats_json is not a flat number record: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Scoring-settings keys missing from the player's stats row (or all of them, when there is no row). */
function diffKeys(
  scoringSettings: Record<string, number>,
  stats: Record<string, number> | undefined,
): string[] {
  const statsKeys = new Set(Object.keys(stats ?? {}));
  return Object.keys(scoringSettings).filter((k) => !statsKeys.has(k));
}

/**
 * Runs the SCORE-2 validation described above against an already-synced, read-only database
 * handle. Throws if the league is not in the `leagues` table.
 */
export function validateScoring(
  h: DbHandle,
  leagueId: string,
  opts?: ValidateScoringOptions,
): ValidationReport {
  const league = readLeague(h, leagueId);
  const scoringSettings = parseScoringSettings(league.scoringJson);
  const weeksChecked = completedWeeks(h, opts);

  let totalPlayerWeeks = 0;
  let matchCount = 0;
  const mismatches: ScoringMismatch[] = [];
  const suspectTally = new Map<string, number>();

  for (const week of weeksChecked) {
    const rosters = readMatchupRows(h, leagueId, week);
    for (const roster of rosters) {
      const playersPoints = parsePlayersPoints(roster.playersPointsJson);
      for (const [playerId, expected] of Object.entries(playersPoints)) {
        totalPlayerWeeks += 1;
        const stats = readPlayerStats(h, league.season, week, playerId);
        const computed = stats === undefined ? 0 : scoreStatLine(stats, scoringSettings);
        const diff = Math.abs(expected - computed);
        if (diff <= MATCH_EPSILON) {
          matchCount += 1;
          continue;
        }
        if (mismatches.length < MAX_REPORTED_MISMATCHES) {
          mismatches.push({ playerId, week, expected, computed, diff });
        }
        for (const key of diffKeys(scoringSettings, stats)) {
          suspectTally.set(key, (suspectTally.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const suspectStatKeys: SuspectStatKey[] = [...suspectTally.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const mismatchCount = totalPlayerWeeks - matchCount;
  const matchRate = totalPlayerWeeks === 0 ? 1 : matchCount / totalPlayerWeeks;

  return {
    leagueId,
    season: league.season,
    weeksChecked,
    totalPlayerWeeks,
    matchCount,
    matchRate,
    mismatchCount,
    mismatches,
    suspectStatKeys,
  };
}
