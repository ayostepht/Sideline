/**
 * Generic content read helpers for `leagues`, `player_week_stats`, and `player_week_projections`
 * (as opposed to `sync-reads.ts`'s week-existence helpers). Used by the worker's
 * league-scored-points materialization job (SCORE-1/SCORE-3, PLAN 4.3/4.5) so it never has to
 * depend on drizzle-orm or read tables directly.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { SeasonType } from "@sideline/shared";
import type { DbHandle } from "./connection.js";
import { leagues, playerWeekProjections, playerWeekStats } from "./schema.js";

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
