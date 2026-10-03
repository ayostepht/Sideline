/**
 * Recompute hook for `league_player_week_points` (SCORE-1/SCORE-3 materialization, T3.2b,
 * narrowed per ADR-013 item 8). After every sync cycle that changed `player_week_stats` or
 * `player_week_projections`, recomputes each league's actual and projected points for every
 * player-week seen so later features (trends, optimizer API, waivers) can read one cheap table
 * instead of rescoring from raw stats every time.
 *
 * Regular season only (same convention as T3.1). Always recomputes both `actualPts` and
 * `projPts` together from a fresh read of the underlying tables, even if only one of them
 * changed, so a partial-input re-run never leaves a stale half-row (and so the upsert's
 * change-counting, which treats every write as a full-row replace, stays correct).
 */
import { rescoreProjection, scoreStatLine } from "@sideline/core";
import {
  readLeagues,
  readPlayerWeekProjections,
  readPlayerWeekStats,
  upsertLeaguePlayerWeekPoints,
  type UpsertLeaguePlayerWeekPointsRow,
} from "@sideline/db";
import type { Logger } from "pino";
import type { RecomputeHook } from "../recompute.js";

const SEASON_TYPE = "regular";

/** Preference order when more than one stats source exists for the same (week, playerId). */
const SOURCE_PRIORITY: Readonly<Record<string, number>> = { sleeper: 0 };

/** Joins week and playerId with a separator that can't appear in a Sleeper numeric player id. */
function pointKey(week: number, playerId: string): string {
  return `${String(week)} ${playerId}`;
}

export function createLeaguePointsRecomputeHook(deps: { logger: Logger }): RecomputeHook {
  return (db, changedTables) => {
    if (!changedTables.has("player_week_stats") && !changedTables.has("player_week_projections")) {
      return;
    }
    for (const league of readLeagues(db)) {
      const statsRows = readPlayerWeekStats(db, league.season, SEASON_TYPE);
      const projectionRows = readPlayerWeekProjections(db, league.season, SEASON_TYPE);

      const identityByKey = new Map<string, { week: number; playerId: string }>();
      const statsByKey = new Map<string, Record<string, number>>();
      const statsSourceByKey = new Map<string, string>();
      for (const row of statsRows) {
        const key = pointKey(row.week, row.playerId);
        identityByKey.set(key, { week: row.week, playerId: row.playerId });
        const existingSource = statsSourceByKey.get(key);
        if (existingSource === undefined) {
          statsByKey.set(key, row.stats);
          statsSourceByKey.set(key, row.source);
          continue;
        }
        const existingPriority = SOURCE_PRIORITY[existingSource] ?? Number.POSITIVE_INFINITY;
        const candidatePriority = SOURCE_PRIORITY[row.source] ?? Number.POSITIVE_INFINITY;
        if (candidatePriority < existingPriority) {
          statsByKey.set(key, row.stats);
          statsSourceByKey.set(key, row.source);
        }
      }

      const projByKey = new Map<string, Record<string, number>>();
      for (const row of projectionRows) {
        const key = pointKey(row.week, row.playerId);
        identityByKey.set(key, { week: row.week, playerId: row.playerId });
        projByKey.set(key, row.stats);
      }

      const rows: UpsertLeaguePlayerWeekPointsRow[] = [];
      for (const [key, identity] of identityByKey) {
        const stats = statsByKey.get(key);
        const projStats = projByKey.get(key);
        rows.push({
          leagueId: league.leagueId,
          season: league.season,
          week: identity.week,
          playerId: identity.playerId,
          actualPts: stats === undefined ? null : scoreStatLine(stats, league.scoringSettings),
          projPts:
            projStats === undefined
              ? null
              : rescoreProjection({ stats: projStats, scoringSettings: league.scoringSettings })
                  .points,
        });
      }

      const result = upsertLeaguePlayerWeekPoints(db, rows);
      deps.logger.info(
        { leagueId: league.leagueId, season: league.season, rowsChanged: result.rowsChanged },
        "recomputed league_player_week_points",
      );
    }
  };
}
