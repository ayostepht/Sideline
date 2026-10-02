import {
  readPlayersFetchedAt,
  replaceTrending,
  upsertPlayers,
  upsertPlayerWeekProjections,
  upsertPlayerWeekStats,
  upsertProjectionSnapshots,
  writePlayersFetchedAt,
} from "@sideline/db";
import type { SeasonType } from "@sideline/shared";
import {
  FANTASY_POSITIONS,
  mapPlayer,
  mapProjection,
  mapStats,
  mapTrending,
  type RawStatRow,
  type SleeperClient,
} from "@sideline/sleeper";
import type { Job, JobContext, JobResult } from "../types.js";
import {
  callOpts,
  checkAbort,
  loadState,
  makeClient,
  MAX_REGULAR_WEEK,
  weekCursor,
  type SleeperJobDeps,
} from "./common.js";
import {
  kickoffsByTeam,
  positionCounts,
  scheduleTeamCode,
  storedProjectionWeeks,
  storedStatsWeeks,
} from "./db-reads.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** `/players/nfl` is fetched at most once per this window. */
export const PLAYERS_MIN_INTERVAL_MS = DAY_MS;
/** A fantasy position losing more than this share of stored players logs a warning. */
export const POSITION_DROP_THRESHOLD = 0.1;
/** Positions with fewer stored players than this are too small to judge. */
export const POSITION_DROP_MIN_STORED = 20;

export const BACKFILL_SEASON = 2025;

export function playersJob(deps: SleeperJobDeps): Job {
  return {
    name: "players",
    async run(ctx) {
      const last = readPlayersFetchedAt(ctx.db);
      if (last !== null && ctx.now().getTime() - Date.parse(last) < PLAYERS_MIN_INTERVAL_MS) {
        return { rowsChanged: 0, status: "skipped", note: `players fetched at ${last}` };
      }
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      // getPlayers always sends etag: false (no If-None-Match, never cached).
      const res = await client.getPlayers(callOpts(ctx));
      const players = res.data.players.map(mapPlayer);
      warnOnPositionDrop(ctx, positionCounts(ctx.db), players);
      const out = upsertPlayers(ctx.db, players, ctx.now().toISOString());
      writePlayersFetchedAt(ctx.db, ctx.now());
      return { rowsChanged: out.rowsChanged, note: `${players.length} players` };
    },
  };
}

function warnOnPositionDrop(
  ctx: JobContext,
  stored: ReadonlyMap<string, number>,
  incoming: readonly { position: string | null }[],
): void {
  const now = new Map<string, number>();
  for (const p of incoming) {
    if (p.position) now.set(p.position, (now.get(p.position) ?? 0) + 1);
  }
  for (const pos of FANTASY_POSITIONS) {
    const before = stored.get(pos) ?? 0;
    const after = now.get(pos) ?? 0;
    if (before < POSITION_DROP_MIN_STORED) continue;
    if ((before - after) / before > POSITION_DROP_THRESHOLD) {
      ctx.logger.warn(
        { position: pos, stored: before, incoming: after },
        "players: fantasy position count dropped sharply versus stored set",
      );
    }
  }
}

export function trendingJob(deps: SleeperJobDeps): Job {
  return {
    name: "trending",
    async run(ctx) {
      const client = makeClient(ctx, deps);
      const fetchedAt = ctx.now().toISOString();
      let rowsChanged = 0;
      for (const type of ["add", "drop"] as const) {
        checkAbort(ctx);
        const res = await client.getTrending(type, 24, 50, callOpts(ctx));
        const entries = mapTrending(res.data, { type, lookbackHours: 24, fetchedAt });
        rowsChanged += replaceTrending(ctx.db, type, entries, fetchedAt).rowsChanged;
      }
      return { rowsChanged };
    },
  };
}

export function statsJob(deps: SleeperJobDeps): Job {
  return {
    name: "stats",
    async run(ctx) {
      const client = makeClient(ctx, deps);
      const cursor = weekCursor(await loadState(ctx, client));
      if (cursor === null) return { rowsChanged: 0, status: "skipped", note: "no active season" };
      // Previous week is refetched so late stat corrections land.
      const weeks = cursor.week > 1 ? [cursor.week - 1, cursor.week] : [cursor.week];
      return syncStats(ctx, client, cursor.season, cursor.seasonType, weeks, true);
    },
  };
}

async function syncStats(
  ctx: JobContext,
  client: SleeperClient,
  season: number,
  seasonType: SeasonType,
  weeks: readonly number[],
  etag: boolean,
): Promise<JobResult> {
  let rowsChanged = 0;
  const unavailable: number[] = [];
  for (const week of weeks) {
    checkAbort(ctx);
    const res = await client.getStats(season, week, seasonType, { ...callOpts(ctx), etag });
    if (res.status === "unavailable") {
      unavailable.push(week);
      continue;
    }
    const wctx = { season, week, seasonType };
    rowsChanged += upsertPlayerWeekStats(
      ctx.db,
      res.rows.map((r) => mapStats(r, wctx)),
    ).rowsChanged;
  }
  return {
    rowsChanged,
    ...(unavailable.length > 0
      ? { note: `stats unavailable for weeks ${unavailable.join(",")}` }
      : {}),
  };
}

function teamOf(row: RawStatRow): string | null {
  const team = row.team ?? row.player?.team;
  if (team) return team;
  return row.player?.position === "DEF" ? row.player_id : null;
}

export function projectionsJob(deps: SleeperJobDeps): Job {
  return {
    name: "projections",
    async run(ctx) {
      const client = makeClient(ctx, deps);
      const cursor = weekCursor(await loadState(ctx, client));
      if (cursor === null) return { rowsChanged: 0, status: "skipped", note: "no active season" };
      const { season, seasonType } = cursor;
      const weeks = cursor.week < MAX_REGULAR_WEEK ? [cursor.week, cursor.week + 1] : [cursor.week];
      let rowsChanged = 0;
      let snapshotsSkipped = 0;
      const unavailable: number[] = [];
      for (const week of weeks) {
        checkAbort(ctx);
        const res = await client.getProjections(season, week, seasonType, callOpts(ctx));
        if (res.status === "unavailable") {
          unavailable.push(week);
          continue;
        }
        const fetchedAt = ctx.now().toISOString();
        const rows = res.rows.map((r) => mapProjection(r, { season, week, seasonType, fetchedAt }));
        rowsChanged += upsertPlayerWeekProjections(ctx.db, rows).rowsChanged;
        // Pregame snapshot: only rows fetched strictly before the player's team kicks off.
        const teams = new Map<string, string | null>(res.rows.map((r) => [r.player_id, teamOf(r)]));
        const kickoffs = kickoffsByTeam(ctx.db, season, week);
        const snap = upsertProjectionSnapshots(ctx.db, rows, (playerId) => {
          const team = teams.get(playerId);
          return team ? (kickoffs.get(scheduleTeamCode(team)) ?? null) : null;
        });
        rowsChanged += snap.rowsChanged;
        snapshotsSkipped += snap.skipped;
      }
      const notes: string[] = [];
      if (unavailable.length > 0)
        notes.push(`projections unavailable for weeks ${unavailable.join(",")}`);
      if (snapshotsSkipped > 0)
        notes.push(`${snapshotsSkipped} snapshots skipped (no kickoff time)`);
      return { rowsChanged, ...(notes.length > 0 ? { note: notes.join("; ") } : {}) };
    },
  };
}

/**
 * One-shot, manual: 2025 regular-season weekly stats and projections (about 36 calls). Weeks
 * already stored are skipped, so a complete backfill makes zero calls. Stored without ETags to
 * keep large bodies out of http_cache. Historical projections get no pregame snapshots (their
 * fetch time is after kickoff by definition).
 */
export function backfillJob(deps: SleeperJobDeps): Job {
  return {
    name: "backfill_2025",
    async run(ctx) {
      const have = {
        stats: storedStatsWeeks(ctx.db, BACKFILL_SEASON, "regular"),
        proj: storedProjectionWeeks(ctx.db, BACKFILL_SEASON, "regular"),
      };
      const all = Array.from({ length: MAX_REGULAR_WEEK }, (_, i) => i + 1);
      const statWeeks = all.filter((w) => !have.stats.has(w));
      const projWeeks = all.filter((w) => !have.proj.has(w));
      if (statWeeks.length === 0 && projWeeks.length === 0) {
        return { rowsChanged: 0, status: "skipped", note: "2025 data already present" };
      }
      const client = makeClient(ctx, deps);
      const stats = await syncStats(ctx, client, BACKFILL_SEASON, "regular", statWeeks, false);
      let rowsChanged = stats.rowsChanged;
      const unavailable: number[] = [];
      for (const week of projWeeks) {
        checkAbort(ctx);
        const res = await client.getProjections(BACKFILL_SEASON, week, "regular", {
          ...callOpts(ctx),
          etag: false,
        });
        if (res.status === "unavailable") {
          unavailable.push(week);
          continue;
        }
        const fetchedAt = ctx.now().toISOString();
        rowsChanged += upsertPlayerWeekProjections(
          ctx.db,
          res.rows.map((r) =>
            mapProjection(r, { season: BACKFILL_SEASON, week, seasonType: "regular", fetchedAt }),
          ),
        ).rowsChanged;
      }
      const notes = [
        stats.note,
        unavailable.length
          ? `projections unavailable for weeks ${unavailable.join(",")}`
          : undefined,
      ].filter((n): n is string => n !== undefined);
      return { rowsChanged, ...(notes.length > 0 ? { note: notes.join("; ") } : {}) };
    },
  };
}
