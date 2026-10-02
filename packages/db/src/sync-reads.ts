/**
 * Typed read helpers replacing the worker's raw SQL (apps/worker/src/jobs/db-reads.ts), same
 * semantics. Mapping old -> new is in each doc comment.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { SeasonTypeSchema, type NflState, type SeasonType } from "@sideline/shared";
import type { DbHandle } from "./connection.js";
import {
  leagues,
  matchups,
  nflState,
  playerWeekProjections,
  playerWeekStats,
  players,
  schedule,
} from "./schema.js";

/** readState -> readNflState. Null when state never synced or the stored row is invalid (unknown season type). */
export function readNflState(h: DbHandle): NflState | null {
  const r = h.db.select().from(nflState).where(eq(nflState.id, 1)).get();
  if (r === undefined) return null;
  const seasonType = SeasonTypeSchema.safeParse(r.seasonType);
  if (!seasonType.success) return null;
  return {
    season: r.season,
    week: r.week,
    seasonType: seasonType.data,
    displayWeek: r.displayWeek,
    leg: r.leg,
    previousSeason: r.previousSeason,
    seasonStartDate: r.seasonStartDate,
  };
}

/** readPlayoffWeekStart -> readLeaguePlayoffWeekStart. */
export function readLeaguePlayoffWeekStart(h: DbHandle, leagueId: string): number | null {
  const r = h.db
    .select({ p: leagues.playoffWeekStart })
    .from(leagues)
    .where(eq(leagues.leagueId, leagueId))
    .get();
  return r?.p ?? null;
}

/** storedMatchupWeeks -> readStoredMatchupWeeks. */
export function readStoredMatchupWeeks(h: DbHandle, leagueId: string): Set<number> {
  const rows = h.db
    .selectDistinct({ week: matchups.week })
    .from(matchups)
    .where(eq(matchups.leagueId, leagueId))
    .all();
  return new Set(rows.map((r) => r.week));
}

/** positionCounts -> readPlayerPositionCounts. */
export function readPlayerPositionCounts(h: DbHandle): Map<string, number> {
  const rows = h.db
    .select({ p: players.position, n: sql<number>`count(*)` })
    .from(players)
    .where(isNotNull(players.position))
    .groupBy(players.position)
    .all();
  const out = new Map<string, number>();
  for (const r of rows) if (r.p !== null) out.set(r.p, r.n);
  return out;
}

/** storedStatsWeeks -> readStoredStatsWeeks (Sleeper-sourced rows only). */
export function readStoredStatsWeeks(
  h: DbHandle,
  season: number,
  seasonType: SeasonType,
): Set<number> {
  const rows = h.db
    .selectDistinct({ week: playerWeekStats.week })
    .from(playerWeekStats)
    .where(
      and(
        eq(playerWeekStats.season, season),
        eq(playerWeekStats.seasonType, seasonType),
        eq(playerWeekStats.source, "sleeper"),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.week));
}

/** storedProjectionWeeks -> readStoredProjectionWeeks. */
export function readStoredProjectionWeeks(
  h: DbHandle,
  season: number,
  seasonType: SeasonType,
): Set<number> {
  const rows = h.db
    .selectDistinct({ week: playerWeekProjections.week })
    .from(playerWeekProjections)
    .where(
      and(
        eq(playerWeekProjections.season, season),
        eq(playerWeekProjections.seasonType, seasonType),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.week));
}

/** kickoffsByTeam -> readKickoffsByTeam. Team code is the schedule spelling; null kickoffs omitted. */
export function readKickoffsByTeam(h: DbHandle, season: number, week: number): Map<string, string> {
  const rows = h.db
    .select({ home: schedule.home, away: schedule.away, k: schedule.kickoffUtc })
    .from(schedule)
    .where(
      and(eq(schedule.season, season), eq(schedule.week, week), isNotNull(schedule.kickoffUtc)),
    )
    .all();
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.k === null) continue;
    out.set(r.home, r.k);
    out.set(r.away, r.k);
  }
  return out;
}

/** readStateFetchedAt -> readNflStateFetchedAt. */
export function readNflStateFetchedAt(h: DbHandle): string | null {
  const r = h.db.select({ f: nflState.fetchedAt }).from(nflState).where(eq(nflState.id, 1)).get();
  return r?.f ?? null;
}

/** touchStateFetchedAt -> touchNflStateFetchedAt. */
export function touchNflStateFetchedAt(h: DbHandle, fetchedAt: string): void {
  h.db.update(nflState).set({ fetchedAt }).where(eq(nflState.id, 1)).run();
}
