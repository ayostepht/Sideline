/**
 * Generic content read helpers for `leagues`, `player_week_stats`, `player_week_projections`,
 * `players`, `schedule`, `league_player_week_points`, `usage_week`, `trending`, and `rosters` (as
 * opposed to `sync-reads.ts`'s week-existence helpers). Used by the worker's league-scored-points
 * and defense-vs-position materialization jobs (SCORE-1/SCORE-3, MATCH-1, PLAN 4.3/4.5) and by
 * T4.5b/T4.5c's waivers and players data functions (PLAN 4.5, ADR-015 T4.5a) so neither has to
 * depend on drizzle-orm or read tables directly.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { SeasonType } from "@sideline/shared";
import type { DbHandle } from "./connection.js";
import {
  leagues,
  leaguePlayerWeekPoints,
  players,
  playerWeekProjections,
  playerWeekStats,
  rosters,
  schedule,
  trending,
  usageWeek,
} from "./schema.js";

const statsRecordSchema = z.record(z.string(), z.number());

function parseStatsRecord(json: string, context: string): Record<string, number> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${context} is not valid JSON: ${message}`, { cause: err });
  }
  const parsed = statsRecordSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${context} is not a flat number record: ${parsed.error.message}`);
  }
  return parsed.data;
}

const stringArraySchema = z.array(z.string());

/**
 * Shared decoder for this file's `*_json` string-array columns (`players.fantasy_positions_json`,
 * `rosters.players_json`/`reserve_json`/`taxi_json`). Throws naming the row's context on malformed
 * JSON, matching {@link parseStatsRecord}'s loud-on-read convention - deliberately NOT
 * `apps/web/lib/server/lineup.ts`'s ad hoc `parseList`, which swallows errors to `[]`. That
 * leniency is a web-layer UX choice (don't 500 a lineup page over one bad row); `packages/db` reads
 * should surface corruption instead of silently hiding it from every caller.
 */
function parseStringArray(json: string, context: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${context} is not valid JSON: ${message}`, { cause: err });
  }
  const parsed = stringArraySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${context} is not a string array: ${parsed.error.message}`);
  }
  return parsed.data;
}

export interface LeagueScoringRow {
  leagueId: string;
  season: number;
  scoringSettings: Record<string, number>;
}

/** Every league's scoring settings. Throws naming the league id if a row's JSON is malformed. */
export function readLeagues(h: DbHandle): LeagueScoringRow[] {
  const rows = h.db
    .select({
      leagueId: leagues.leagueId,
      season: leagues.season,
      scoringJson: leagues.scoringJson,
    })
    .from(leagues)
    .all();
  return rows.map((r) => ({
    leagueId: r.leagueId,
    season: r.season,
    scoringSettings: parseStatsRecord(
      r.scoringJson,
      `leagues.scoring_json for league "${r.leagueId}"`,
    ),
  }));
}

export interface PlayerWeekStatsRow {
  week: number;
  playerId: string;
  stats: Record<string, number>;
  source: string;
}

/** Every stats row for a season/season-type, across all weeks and sources. */
export function readPlayerWeekStats(
  h: DbHandle,
  season: number,
  seasonType: SeasonType,
): PlayerWeekStatsRow[] {
  const rows = h.db
    .select({
      week: playerWeekStats.week,
      playerId: playerWeekStats.playerId,
      statsJson: playerWeekStats.statsJson,
      source: playerWeekStats.source,
    })
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.season, season), eq(playerWeekStats.seasonType, seasonType)))
    .all();
  return rows.map((r) => ({
    week: r.week,
    playerId: r.playerId,
    stats: parseStatsRecord(
      r.statsJson,
      `player_week_stats.stats_json for player "${r.playerId}" week ${String(r.week)}`,
    ),
    source: r.source,
  }));
}

export interface PlayerWeekProjectionRow {
  week: number;
  playerId: string;
  stats: Record<string, number>;
}

/** Every projection row for a season/season-type, across all weeks. */
export function readPlayerWeekProjections(
  h: DbHandle,
  season: number,
  seasonType: SeasonType,
): PlayerWeekProjectionRow[] {
  const rows = h.db
    .select({
      week: playerWeekProjections.week,
      playerId: playerWeekProjections.playerId,
      statsJson: playerWeekProjections.statsJson,
    })
    .from(playerWeekProjections)
    .where(
      and(
        eq(playerWeekProjections.season, season),
        eq(playerWeekProjections.seasonType, seasonType),
      ),
    )
    .all();
  return rows.map((r) => ({
    week: r.week,
    playerId: r.playerId,
    stats: parseStatsRecord(
      r.statsJson,
      `player_week_projections.stats_json for player "${r.playerId}" week ${String(r.week)}`,
    ),
  }));
}

export interface PlayerTeamPositionRow {
  playerId: string;
  team: string | null;
  position: string | null;
}

/** Every player's team and position (for defense-vs-position materialization, MATCH-1). */
export function readPlayersTeamPosition(h: DbHandle): PlayerTeamPositionRow[] {
  return h.db
    .select({
      playerId: players.playerId,
      team: players.team,
      position: players.position,
    })
    .from(players)
    .all();
}

export interface ScheduleRow {
  week: number;
  home: string;
  away: string;
}

/** Every game for a season, home and away teams by week. */
export function readSchedule(h: DbHandle, season: number): ScheduleRow[] {
  return h.db
    .select({
      week: schedule.week,
      home: schedule.home,
      away: schedule.away,
    })
    .from(schedule)
    .where(eq(schedule.season, season))
    .all();
}

export interface LeaguePlayerWeekPointsRow {
  week: number;
  playerId: string;
  actualPts: number | null;
}

/** Every league-scored row for a league and season, actual points only. */
export function readLeaguePlayerWeekPoints(
  h: DbHandle,
  leagueId: string,
  season: number,
): LeaguePlayerWeekPointsRow[] {
  return h.db
    .select({
      week: leaguePlayerWeekPoints.week,
      playerId: leaguePlayerWeekPoints.playerId,
      actualPts: leaguePlayerWeekPoints.actualPts,
    })
    .from(leaguePlayerWeekPoints)
    .where(
      and(eq(leaguePlayerWeekPoints.leagueId, leagueId), eq(leaguePlayerWeekPoints.season, season)),
    )
    .all();
}

export interface UsageWeekRow {
  season: number;
  week: number;
  playerId: string;
  team: string | null;
  snapPct: number | null;
  targets: number | null;
  targetShare: number | null;
  airYardsShare: number | null;
  carries: number | null;
  carryShare: number | null;
  rzTouches: number | null;
}

/**
 * Every player's nflverse usage for one season/week (T4.5a, ADR-015 amendment; TREND-2/TREND-4's
 * usage delta inputs). `season, week` is a prefix of `usage_week`'s own primary key
 * (`season, week, player_id`), so this is a covering-index lookup with no new index needed.
 * Callers that need one player's history across several weeks (TREND-4's `usageDelta`) call this
 * once per week in their window and filter to the player id, the same multi-call pattern
 * `readDefenseVsPosition` in `lineup.ts` uses for its own `through_week` window.
 */
export function readUsageWeek(h: DbHandle, season: number, week: number): UsageWeekRow[] {
  return h.db
    .select({
      season: usageWeek.season,
      week: usageWeek.week,
      playerId: usageWeek.playerId,
      team: usageWeek.team,
      snapPct: usageWeek.snapPct,
      targets: usageWeek.targets,
      targetShare: usageWeek.targetShare,
      airYardsShare: usageWeek.airYardsShare,
      carries: usageWeek.carries,
      carryShare: usageWeek.carryShare,
      rzTouches: usageWeek.rzTouches,
    })
    .from(usageWeek)
    .where(and(eq(usageWeek.season, season), eq(usageWeek.week, week)))
    .all();
}

const trendingTypeSchema = z.enum(["add", "drop"]);

export interface TrendingRow {
  playerId: string;
  type: "add" | "drop";
  count: number;
  lookbackHours: number;
  fetchedAt: string;
}

export interface TrendingReadFilter {
  type?: "add" | "drop";
  lookbackHours?: number;
}

/**
 * Current trending rows (TREND-5's momentum signal; WAIVER-1's candidate pool seed). No
 * `fetchedAt`-recency filtering: `replaceTrending` (`upserts.ts`) is a delete-then-upsert per
 * `(type, lookbackHours)` call that removes every existing row for that combo not present in the
 * new fetch, so every row currently in the table is already current as of that combo's last sync -
 * there is no accumulation of stale players to filter out. A caller that wants to know whether the
 * *sync itself* is stale should use `lastSuccessAt(h, "trending")`, not a per-row timestamp check
 * here. `lookbackHours` (and `type`) filters narrow to one Sleeper trending window/direction, since
 * the table can hold several windows (e.g. 24h and 168h) at once.
 */
export function readTrending(h: DbHandle, filter: TrendingReadFilter = {}): TrendingRow[] {
  const conditions = [];
  if (filter.type !== undefined) conditions.push(eq(trending.type, filter.type));
  if (filter.lookbackHours !== undefined) {
    conditions.push(eq(trending.lookbackHours, filter.lookbackHours));
  }
  const rows = h.db
    .select({
      playerId: trending.playerId,
      type: trending.type,
      count: trending.count,
      lookbackHours: trending.lookbackHours,
      fetchedAt: trending.fetchedAt,
    })
    .from(trending)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all();
  return rows.map((r) => {
    const parsed = trendingTypeSchema.safeParse(r.type);
    if (!parsed.success) {
      throw new Error(`trending.type for player "${r.playerId}" is not "add" or "drop": ${r.type}`);
    }
    return {
      playerId: r.playerId,
      type: parsed.data,
      count: r.count,
      lookbackHours: r.lookbackHours,
      fetchedAt: r.fetchedAt,
    };
  });
}

export interface LeagueWeekPositionRankRow {
  playerId: string;
  position: string;
  actualPts: number;
  rank: number;
}

/**
 * Each played player's rank (1 = best) among every player at their own position who scored in a
 * league/season/week (TREND-3's `positionRank` boom/bust input, PLAN 4.5). Built from
 * {@link readLeaguePlayerWeekPoints} (filtered to the one week, actual points only, null-score rows
 * excluded as "did not play") joined in memory with {@link readPlayersTeamPosition} - no SQL join,
 * matching this file's existing style of composing its own exported reads rather than reaching
 * into `players`/`league_player_week_points` a second way. Players with no known position are
 * omitted (they cannot be ranked within a position group).
 *
 * Tie-break rule: standard competition ranking ("1224"). Players tied on `actualPts` share the same
 * rank; the next distinct (lower) score's rank equals the count of players strictly ahead of it,
 * plus one (e.g. scores 20, 15, 15, 10 rank 1, 2, 2, 4). This is well-defined with no secondary key
 * needed and matches how "league rank" is conventionally reported on other fantasy sites. Callers
 * computing WAIVER/TREND boundaries like `rank <= N` (boom) or `rank > 1.5 * N` (bust) should read
 * this as "no worse than the Nth-best score", not "one of exactly N players".
 */
export function readLeagueWeekPositionRanks(
  h: DbHandle,
  leagueId: string,
  season: number,
  week: number,
): LeagueWeekPositionRankRow[] {
  const positionById = new Map(
    readPlayersTeamPosition(h).map((p) => [p.playerId, p.position] as const),
  );
  const byPosition = new Map<string, { playerId: string; actualPts: number }[]>();
  for (const r of readLeaguePlayerWeekPoints(h, leagueId, season)) {
    if (r.week !== week || r.actualPts === null) continue;
    const position = positionById.get(r.playerId) ?? null;
    if (position === null) continue;
    const arr = byPosition.get(position) ?? [];
    arr.push({ playerId: r.playerId, actualPts: r.actualPts });
    byPosition.set(position, arr);
  }

  const out: LeagueWeekPositionRankRow[] = [];
  for (const [position, entries] of byPosition) {
    entries.sort((a, b) => b.actualPts - a.actualPts);
    let prevScore: number | null = null;
    let prevRank = 0;
    entries.forEach((e, i) => {
      const rank = e.actualPts === prevScore ? prevRank : i + 1;
      prevScore = e.actualPts;
      prevRank = rank;
      out.push({ playerId: e.playerId, position, actualPts: e.actualPts, rank });
    });
  }
  return out;
}

export interface FullPlayerRow {
  playerId: string;
  fullName: string;
  position: string | null;
  fantasyPositions: string[];
  team: string | null;
  status: string | null;
  injuryStatus: string | null;
}

/**
 * Generalizes `apps/web/lib/server/lineup.ts`'s private ad hoc `readPlayers` (full_name, position,
 * fantasy_positions_json decoded, team, status, injury_status) into a shared `packages/db` export
 * so T4.5b (waivers) and T4.5c (players list/detail) don't each hand-roll it (T4.5a, ADR-015
 * amendment). `lineup.ts` itself is left untouched - switching it over is a future cleanup, out of
 * this task's scope.
 *
 * `ids` omitted returns every player (T4.5c's players list); an empty array returns `[]` without
 * querying (an empty SQL `IN ()` list is invalid) - the same early-return `lineup.ts`'s original
 * `readPlayers` used for its `Map`.
 */
export function readPlayers(h: DbHandle, ids?: readonly string[]): FullPlayerRow[] {
  if (ids !== undefined && ids.length === 0) return [];
  const rows = h.db
    .select({
      playerId: players.playerId,
      fullName: players.fullName,
      position: players.position,
      fantasyPositionsJson: players.fantasyPositionsJson,
      team: players.team,
      status: players.status,
      injuryStatus: players.injuryStatus,
    })
    .from(players)
    .where(ids === undefined ? undefined : inArray(players.playerId, [...ids]))
    .all();
  return rows.map((r) => ({
    playerId: r.playerId,
    fullName: r.fullName,
    position: r.position,
    fantasyPositions: parseStringArray(
      r.fantasyPositionsJson,
      `players.fantasy_positions_json for player "${r.playerId}"`,
    ),
    team: r.team,
    status: r.status,
    injuryStatus: r.injuryStatus,
  }));
}

/**
 * Every player id on any roster in a league - the union of `players`, `reserve`, and `taxi` across
 * every team (WAIVER-1's "not on any roster" candidate-pool filter, T4.5a). Generalizes
 * `lineup.ts`'s `readRoster` decode pattern (`players_json`/`reserve_json`/`taxi_json`, parsed with
 * the same string-array shape) across every roster instead of one. `"0"`, Sleeper's empty-slot
 * placeholder (seen in `starters` arrays; harmless if present here too), is never a real player and
 * is excluded.
 */
export function readRosteredPlayerIds(h: DbHandle, leagueId: string): Set<string> {
  const rows = h.db
    .select({
      playersJson: rosters.playersJson,
      reserveJson: rosters.reserveJson,
      taxiJson: rosters.taxiJson,
    })
    .from(rosters)
    .where(eq(rosters.leagueId, leagueId))
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    for (const json of [r.playersJson, r.reserveJson, r.taxiJson]) {
      for (const id of parseStringArray(json, `rosters json column for league "${leagueId}"`)) {
        if (id !== "0") out.add(id);
      }
    }
  }
  return out;
}
