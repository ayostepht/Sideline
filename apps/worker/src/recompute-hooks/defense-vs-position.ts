/**
 * Recompute hook for `defense_vs_position` (MATCH-1 materialization, T3.5b). After every sync
 * cycle that changed `player_week_stats` or `schedule`, recomputes each NFL team's
 * defense-vs-position strength for every week and position this season, per league (scoring is
 * league-specific), so the lineup API can read a ready-made matchup grade instead of recomputing
 * an 18-week aggregation on every request.
 *
 * Regular season only (same convention as T3.1/T3.2b). Unlike the backtest's walk-forward
 * `buildDvpContext` (which deliberately excludes the week being evaluated to avoid look-ahead),
 * this hook materializes a live current snapshot: a week `W`'s row uses the cumulative history of
 * weeks `1..W` inclusive, because the just-completed week's own results belong in that week's own
 * DvP snapshot.
 */
import { computeDefenseVsPosition, scoreStatLine } from "@sideline/core";
import {
  readLeagues,
  readPlayerWeekStats,
  readPlayersTeamPosition,
  readSchedule,
  upsertDefenseVsPosition,
  type UpsertDefenseVsPositionRow,
} from "@sideline/db";
import type { Logger } from "pino";
import type { RecomputeHook } from "../recompute.js";

const SEASON_TYPE = "regular";

interface PlayerInfo {
  team: string;
  position: string;
}

interface Game {
  home: string;
  away: string;
}

/**
 * Sleeper uses `LAR` where nflverse (the `schedule` table, see `readSchedule`) uses `LA`
 * (docs/sleeper-api-notes.md section 14e). `pointsAllowed` below is keyed by the schedule's
 * (nflverse) codes, so this conversion only happens once, at the point a player's own (Sleeper)
 * team code is used to look up its game.
 */
function scheduleTeamCode(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}

function addToBucket<K1, K2, V>(map: Map<K1, Map<K2, V[]>>, key1: K1, key2: K2, value: V): void {
  let inner = map.get(key1);
  if (inner === undefined) {
    inner = new Map();
    map.set(key1, inner);
  }
  let arr = inner.get(key2);
  if (arr === undefined) {
    arr = [];
    inner.set(key2, arr);
  }
  arr.push(value);
}

export function createDefenseVsPositionRecomputeHook(deps: { logger: Logger }): RecomputeHook {
  return (db, changedTables) => {
    if (!changedTables.has("player_week_stats") && !changedTables.has("schedule")) {
      return;
    }

    const playersIndex = new Map<string, PlayerInfo>();
    for (const p of readPlayersTeamPosition(db)) {
      if (p.team === null || p.position === null) continue;
      playersIndex.set(p.playerId, { team: p.team, position: p.position });
    }

    for (const league of readLeagues(db)) {
      const scheduleByWeek = new Map<number, Game[]>();
      for (const g of readSchedule(db, league.season)) {
        let arr = scheduleByWeek.get(g.week);
        if (arr === undefined) {
          arr = [];
          scheduleByWeek.set(g.week, arr);
        }
        arr.push({ home: g.home, away: g.away });
      }
      if (scheduleByWeek.size === 0) {
        deps.logger.debug(
          { leagueId: league.leagueId, season: league.season },
          "skipping defense_vs_position: no schedule rows for this league/season",
        );
        continue;
      }

      const statsByWeek = new Map<number, Map<string, Record<string, number>>>();
      for (const row of readPlayerWeekStats(db, league.season, SEASON_TYPE)) {
        let byPlayer = statsByWeek.get(row.week);
        if (byPlayer === undefined) {
          byPlayer = new Map();
          statsByWeek.set(row.week, byPlayer);
        }
        byPlayer.set(row.playerId, row.stats);
      }

      const weeks = [...new Set([...scheduleByWeek.keys(), ...statsByWeek.keys()])]
        .filter((w) => scheduleByWeek.has(w) && statsByWeek.has(w))
        .sort((a, b) => a - b);

      const rows: UpsertDefenseVsPositionRow[] = [];
      for (const throughWeek of weeks) {
        const pointsAllowed = new Map<
          string,
          Map<string, { week: number; pointsAllowed: number }[]>
        >();
        const positionTotals = new Map<string, number[]>();

        for (let w = 1; w <= throughWeek; w += 1) {
          const statsThisWeek = statsByWeek.get(w);
          const games = scheduleByWeek.get(w);
          if (statsThisWeek === undefined || games === undefined) continue;

          for (const { home, away } of games) {
            const homeTotals = new Map<string, number>();
            const awayTotals = new Map<string, number>();
            for (const [playerId, stats] of statsThisWeek) {
              const info = playersIndex.get(playerId);
              if (info === undefined) continue;
              const team = scheduleTeamCode(info.team);
              if (team !== home && team !== away) continue;
              const pts = scoreStatLine(stats, league.scoringSettings);
              const totals = team === home ? homeTotals : awayTotals;
              totals.set(info.position, (totals.get(info.position) ?? 0) + pts);
            }
            for (const [position, pts] of homeTotals) {
              addToBucket(pointsAllowed, away, position, { week: w, pointsAllowed: pts });
              let arr = positionTotals.get(position);
              if (arr === undefined) {
                arr = [];
                positionTotals.set(position, arr);
              }
              arr.push(pts);
            }
            for (const [position, pts] of awayTotals) {
              addToBucket(pointsAllowed, home, position, { week: w, pointsAllowed: pts });
              let arr = positionTotals.get(position);
              if (arr === undefined) {
                arr = [];
                positionTotals.set(position, arr);
              }
              arr.push(pts);
            }
          }
        }

        const leaguePositionAverage = new Map<string, number>();
        for (const [position, values] of positionTotals) {
          const sum = values.reduce((s, v) => s + v, 0);
          leaguePositionAverage.set(position, values.length === 0 ? 0 : sum / values.length);
        }

        for (const [team, byPosition] of pointsAllowed) {
          for (const [position, entries] of byPosition) {
            const avgPos = leaguePositionAverage.get(position) ?? 0;
            const result = computeDefenseVsPosition({
              weeklyPointsAllowed: entries,
              leaguePositionAverage: avgPos,
            });
            rows.push({
              leagueId: league.leagueId,
              season: league.season,
              throughWeek,
              team,
              position,
              ptsAllowedPg: result.ptsAllowedPg,
              games: result.games,
            });
          }
        }
      }

      const result = upsertDefenseVsPosition(db, rows);
      deps.logger.info(
        { leagueId: league.leagueId, season: league.season, rowsChanged: result.rowsChanged },
        "recomputed defense_vs_position",
      );
    }
  };
}
