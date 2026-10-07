import {
  countPlayersWithEspnId,
  readKickoffsByTeam,
  readPlayerPositionCounts,
  readPlayersFetchedAt,
  readStoredProjectionWeeks,
  readStoredStatsWeeks,
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
import { syncScheduleForSeason, syncUsageForSeason, type NflverseJobDeps } from "./nflverse-job.js";
import { scheduleTeamCode } from "./team-code.js";

/**
 * `/players/nfl` is fetched at most once per this window. 20h, not 24h: the 04:30 cron can finish
 * minutes later one day than the last, and a full 24h guard then skipped the next day's run.
 * 20h still blocks a second fetch the same day.
 */
export const PLAYERS_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
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
        const c = countPlayersWithEspnId(ctx.db);
        if (c.players === 0 || c.withEspnId > 0) {
          return { rowsChanged: 0, status: "skipped", note: `players fetched at ${last}` };
        }
        ctx.logger.info(
          { last, players: c.players },
          "players: refetching inside the guard window because no stored player has an ESPN id",
        );
      }
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      // getPlayers always sends etag: false (no If-None-Match, never cached).
      const res = await client.getPlayers(callOpts(ctx));
      const players = res.data.players.map(mapPlayer);
      warnOnPositionDrop(ctx, readPlayerPositionCounts(ctx.db), players);
      // One transaction: a crash cannot leave players written without the once-a-day marker
      // (or the marker without players). No network call happens inside it.
      const out = ctx.db.sqlite
        .transaction(() => {
          const r = upsertPlayers(ctx.db, players, ctx.now().toISOString());
          writePlayersFetchedAt(ctx.db, ctx.now());
          return r;
        })
        .immediate();
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

/**
 * Weeks of player_week_stats to fetch, in order: the current week, the previous week (stats can
 * land late after the week rolls over), then every earlier week not yet stored. The last part
 * self-heals a gap left by downtime or a fresh install starting mid-season. Stats only exist for
 * weeks that have already happened, so this never looks forward past `current` (unlike
 * `matchupWeeksToFetch`, which also schedules future weeks).
 */
export function statsWeeksToFetch(current: number, stored: ReadonlySet<number>): number[] {
  const weeks: number[] = [current];
  if (current > 1) weeks.push(current - 1);
  for (let w = 1; w < current - 1; w++) if (!stored.has(w)) weeks.push(w);
  return weeks;
}

export function statsJob(deps: SleeperJobDeps): Job {
  return {
    name: "stats",
    async run(ctx) {
      const client = makeClient(ctx, deps);
      const cursor = weekCursor(await loadState(ctx, client));
      if (cursor === null) return { rowsChanged: 0, status: "skipped", note: "no active season" };
      const stored = readStoredStatsWeeks(ctx.db, cursor.season, cursor.seasonType);
      const weeks = statsWeeksToFetch(cursor.week, stored);
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
    const mapped = res.rows.map((r) => mapStats(r, wctx));
    // One transaction per week (fetched above, so no lock is held across the network): a failure
    // part-way leaves no rows for the week and the next run refetches it.
    rowsChanged += ctx.db.sqlite
      .transaction(() => upsertPlayerWeekStats(ctx.db, mapped).rowsChanged)
      .immediate();
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
        // Pregame snapshot: only rows fetched strictly before the player's team kicks off.
        const teams = new Map<string, string | null>(res.rows.map((r) => [r.player_id, teamOf(r)]));
        const written = ctx.db.sqlite
          .transaction(() => {
            const main = upsertPlayerWeekProjections(ctx.db, rows).rowsChanged;
            const kickoffs = readKickoffsByTeam(ctx.db, season, week);
            const snap = upsertProjectionSnapshots(ctx.db, rows, (playerId) => {
              const team = teams.get(playerId);
              return team ? (kickoffs.get(scheduleTeamCode(team)) ?? null) : null;
            });
            return { changed: main + snap.rowsChanged, skipped: snap.skipped };
          })
          .immediate();
        rowsChanged += written.changed;
        snapshotsSkipped += written.skipped;
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

/** True when any schedule row for the season is already stored (no row count threshold needed). */
function scheduleAlreadyStored(ctx: JobContext, season: number): boolean {
  const row = ctx.db.sqlite
    .prepare("SELECT COUNT(*) AS n FROM schedule WHERE season = ?")
    .get(season) as { n: number };
  return row.n > 0;
}

/**
 * One-shot, manual: 2025 regular-season weekly stats and projections (about 36 calls), plus the
 * 2025 schedule via nflverse (one more call) so backtests have a resolvable opponent for every
 * 2025 player-week (see `syncScheduleForSeason`). The three parts are skipped independently: each
 * already-stored part makes zero calls for that part, so a complete backfill makes zero calls at
 * all. The schedule part degrades (skips without failing the job) when ENABLE_NFLVERSE is off or
 * nflverse is unreachable, same as the "nflverse" job. Stats and projections are stored without
 * ETags to keep large bodies out of http_cache. Historical projections get no pregame snapshots
 * (their fetch time is after kickoff by definition).
 */
function countRows(ctx: JobContext, sql: string, ...params: unknown[]): number {
  return (ctx.db.sqlite.prepare(sql).get(...params) as { n: number }).n;
}

export function backfillJob(deps: SleeperJobDeps, nflverseDeps: NflverseJobDeps = {}): Job {
  return {
    name: "backfill_2025",
    async run(ctx) {
      const have = {
        stats: readStoredStatsWeeks(ctx.db, BACKFILL_SEASON, "regular"),
        proj: readStoredProjectionWeeks(ctx.db, BACKFILL_SEASON, "regular"),
      };
      const all = Array.from({ length: MAX_REGULAR_WEEK }, (_, i) => i + 1);
      const statWeeks = all.filter((w) => !have.stats.has(w));
      const projWeeks = all.filter((w) => !have.proj.has(w));
      const scheduleAlready = scheduleAlreadyStored(ctx, BACKFILL_SEASON);
      const usageAlready =
        !ctx.config.enableNflverse ||
        // Usage joins to the players directory; with none stored there is nothing to do yet.
        countRows(ctx, "SELECT COUNT(*) AS n FROM players") === 0 ||
        countRows(ctx, "SELECT COUNT(*) AS n FROM usage_week WHERE season = ?", BACKFILL_SEASON) >
          0;
      if (statWeeks.length === 0 && projWeeks.length === 0 && scheduleAlready && usageAlready) {
        return { rowsChanged: 0, status: "skipped", note: "2025 data already present" };
      }
      let rowsChanged = 0;
      let scheduleNote: string;
      if (scheduleAlready) {
        scheduleNote = "schedule: 2025 already present";
      } else {
        const sched = await syncScheduleForSeason(ctx, nflverseDeps, BACKFILL_SEASON);
        rowsChanged += sched.rowsChanged;
        scheduleNote = `schedule: ${sched.note ?? "synced"}`;
      }
      if (!usageAlready) {
        const usage = await syncUsageForSeason(ctx, nflverseDeps, BACKFILL_SEASON);
        rowsChanged += usage.rowsChanged;
        scheduleNote += `; ${usage.note}`;
      }
      const client = makeClient(ctx, deps);
      const stats = await syncStats(ctx, client, BACKFILL_SEASON, "regular", statWeeks, false);
      rowsChanged += stats.rowsChanged;
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
        const rows = res.rows.map((r) =>
          mapProjection(r, { season: BACKFILL_SEASON, week, seasonType: "regular", fetchedAt }),
        );
        rowsChanged += ctx.db.sqlite
          .transaction(() => upsertPlayerWeekProjections(ctx.db, rows).rowsChanged)
          .immediate();
      }
      const notes = [
        scheduleNote,
        stats.note,
        unavailable.length
          ? `projections unavailable for weeks ${unavailable.join(",")}`
          : undefined,
      ].filter((n): n is string => n !== undefined);
      return { rowsChanged, ...(notes.length > 0 ? { note: notes.join("; ") } : {}) };
    },
  };
}
