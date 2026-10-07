/**
 * Typed read helpers replacing the worker's raw SQL (apps/worker/src/jobs/db-reads.ts), same
 * semantics. Mapping old -> new is in each doc comment.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { SeasonTypeSchema, type NflState, type SeasonType } from "@sideline/shared";
import type { DbHandle } from "./connection.js";
import {
  leagues,
  matchups,
  nflState,
  playerWeekProjections,
  playerNews,
  playerNewsFetches,
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

/** New (T5.4a, PLAN 4.5): number of playoff spots, null when unknown or the league doesn't exist. */
export function readLeaguePlayoffTeams(h: DbHandle, leagueId: string): number | null {
  const r = h.db
    .select({ p: leagues.playoffTeams })
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

export interface PlayerNewsItem {
  id: string;
  playerId: string;
  headline: string;
  summary: string | null;
  url: string | null;
  source: string;
  /** Raw stored text; the server narrows it to shared PlayerNewsKind. */
  kind: string;
  publishedAt: string;
  fetchedAt: string;
}

/** Newest-first news for one player (default limit 5). */
export function readPlayerNews(
  h: DbHandle,
  playerId: string,
  opts: { limit?: number } = {},
): PlayerNewsItem[] {
  return h.db
    .select()
    .from(playerNews)
    .where(eq(playerNews.playerId, playerId))
    .orderBy(desc(playerNews.publishedAt), desc(playerNews.id))
    .limit(opts.limit ?? 5)
    .all();
}

/** Latest `fetched_at` over all stored news for a player; null when none. Uses `player_news_player_idx`. */
export function readPlayerNewsLastFetchedAt(h: DbHandle, playerId: string): string | null {
  const row = h.db
    .select({ m: sql<string | null>`max(${playerNews.fetchedAt})` })
    .from(playerNews)
    .where(eq(playerNews.playerId, playerId))
    .get();
  return row?.m ?? null;
}

/** Upserts the latest news fetch attempt for a player (one row per player). */
export function recordPlayerNewsFetch(
  h: DbHandle,
  a: { playerId: string; attemptedAt: string; ok: boolean; itemCount: number },
): void {
  h.db
    .insert(playerNewsFetches)
    .values(a)
    .onConflictDoUpdate({
      target: playerNewsFetches.playerId,
      set: { attemptedAt: a.attemptedAt, ok: a.ok, itemCount: a.itemCount },
    })
    .run();
}

/**
 * Latest successful news fetch time for a player: the later of the last `ok` attempt and the
 * newest stored news row's `fetched_at`. Failed attempts are ignored so they retry. Null when none.
 */
export function readPlayerNewsFetchedAt(h: DbHandle, playerId: string): string | null {
  const attempt = h.db
    .select({ at: playerNewsFetches.attemptedAt })
    .from(playerNewsFetches)
    .where(and(eq(playerNewsFetches.playerId, playerId), eq(playerNewsFetches.ok, true)))
    .get();
  const rows = readPlayerNewsLastFetchedAt(h, playerId);
  const a = attempt?.at ?? null;
  if (a === null) return rows;
  if (rows === null) return a;
  return a > rows ? a : rows;
}

/** player_id to ESPN id for players with a non-null ESPN id; all players when `playerIds` is omitted. */
export function readPlayerEspnIds(h: DbHandle, playerIds?: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const collect = (rows: { id: string; e: string | null }[]): void => {
    for (const r of rows) if (r.e !== null) out.set(r.id, r.e);
  };
  const sel = () => h.db.select({ id: players.playerId, e: players.espnId }).from(players);
  if (playerIds === undefined) {
    collect(sel().where(isNotNull(players.espnId)).all());
    return out;
  }
  for (let i = 0; i < playerIds.length; i += 500) {
    collect(
      sel()
        .where(
          and(isNotNull(players.espnId), inArray(players.playerId, playerIds.slice(i, i + 500))),
        )
        .all(),
    );
  }
  return out;
}

/** Player count and how many have a non-null ESPN id. */
export function countPlayersWithEspnId(h: DbHandle): { players: number; withEspnId: number } {
  const r = h.db
    .select({
      players: sql<number>`count(*)`,
      withEspnId: sql<number>`count(${players.espnId})`,
    })
    .from(players)
    .get();
  return { players: r?.players ?? 0, withEspnId: r?.withEspnId ?? 0 };
}
