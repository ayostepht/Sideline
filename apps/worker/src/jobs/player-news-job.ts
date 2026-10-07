import {
  prunePlayerNews,
  readPlayerEspnIds,
  readRosteredPlayerIds,
  recordPlayerNewsFetch,
  upsertPlayerNews,
  type PlayerNewsRow,
} from "@sideline/db";
import {
  createMinIntervalLimiter,
  fetchEspnPlayerNews,
  fetchEspnRecentNews,
  type EspnNewsItem,
  type FetchFn,
  type MinIntervalLimiter,
  type ProviderResult,
} from "@sideline/providers";
import type { Job, JobContext, JobResult } from "../types.js";
import { requireLeagueId } from "./common.js";

/** Rostered players refreshed per run; the rest rotate in on later runs. */
export const PLAYER_NEWS_CAP = 60;
export const NEWS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ESPN_MIN_INTERVAL_MS = 250;
export const NEWS_SOURCE = "ESPN";

export interface PlayerNewsJobDeps {
  /** Injected in tests and fixture mode; defaults to the global fetch. */
  fetch?: FetchFn;
  /** Test seam: replaces the shared ESPN limiter (default 250 ms spacing). */
  limiter?: MinIntervalLimiter;
  /** Test seam: per-run cap on per-player calls. */
  cap?: number;
  /** Test seam: overrides the per-request timeout for every call (defaults: 10 s feed, 5 s per player). */
  timeoutMs?: number;
}

/** Stop the per-player loop after this many failures in a row. */
export const MAX_CONSECUTIVE_FAILURES = 3;
export const PLAYER_TIMEOUT_MS = 5_000;

function toRow(item: EspnNewsItem, playerId: string, fetchedAt: string): PlayerNewsRow {
  return {
    id: `espn:${item.storyId}:${playerId}`,
    playerId,
    headline: item.headline,
    summary: item.summary,
    url: item.url,
    source: NEWS_SOURCE,
    publishedAt: item.publishedAt,
    fetchedAt,
  };
}

/** Writes rows in one short transaction (no network inside) and prunes expired news. */
function store(ctx: JobContext, rows: Map<string, PlayerNewsRow>): number {
  const cutoff = new Date(ctx.now().getTime() - NEWS_RETENTION_MS).toISOString();
  const fresh = [...rows.values()].filter((r) => r.publishedAt >= cutoff);
  return ctx.db.sqlite
    .transaction(() => {
      const out = upsertPlayerNews(ctx.db, fresh);
      const pruned = prunePlayerNews(ctx.db, { olderThanIso: cutoff });
      return out.rowsChanged + pruned;
    })
    .immediate();
}

export function playerNewsJob(deps: PlayerNewsJobDeps = {}): Job {
  // One limiter and one rotation cursor per process, so every ESPN call is paced together.
  const limiter = deps.limiter ?? createMinIntervalLimiter(ESPN_MIN_INTERVAL_MS);
  const cap = deps.cap ?? PLAYER_NEWS_CAP;
  let cursor = 0;

  const opts = (ctx: JobContext, timeoutMs?: number) => {
    const t = deps.timeoutMs ?? timeoutMs;
    return {
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      now: () => ctx.now(),
      limiter,
      ...(t !== undefined ? { timeoutMs: t } : {}),
    };
  };

  /** Rate limited, unavailable, or hanging: more calls would only pile on. */
  function isHardStop(res: ProviderResult<unknown>): boolean {
    if (res.ok) return false;
    return res.status === 429 || res.status === 503 || /timed out/.test(res.message);
  }

  function warn(ctx: JobContext, what: string, res: ProviderResult<unknown>): void {
    if (!res.ok) ctx.logger.warn({ what, reason: res.reason, message: res.message }, "ESPN news");
  }

  async function forPlayer(
    ctx: JobContext,
    playerIds: readonly string[],
    espnId: string,
    rows: Map<string, PlayerNewsRow>,
    fetchedAt: string,
  ): Promise<ProviderResult<unknown>> {
    const res = await fetchEspnPlayerNews(espnId, opts(ctx, PLAYER_TIMEOUT_MS));
    const attemptedAt = ctx.now().toISOString();
    if (!res.ok) {
      warn(ctx, `player ${playerIds.join(",")}`, res);
      for (const playerId of playerIds) {
        recordPlayerNewsFetch(ctx.db, { playerId, attemptedAt, ok: false, itemCount: 0 });
      }
      return res;
    }
    const cutoff = new Date(ctx.now().getTime() - NEWS_RETENTION_MS).toISOString();
    let itemCount = 0;
    for (const item of res.data) {
      // Keep items about the requested athlete; items with no athlete ids are attributed to them.
      if (item.espnAthleteIds.length > 0 && !item.espnAthleteIds.includes(espnId)) continue;
      if (item.publishedAt >= cutoff) itemCount++;
      for (const playerId of playerIds) {
        const row = toRow(item, playerId, fetchedAt);
        rows.set(row.id, row);
      }
    }
    // Each write is its own short transaction; no network call is in flight here.
    for (const playerId of playerIds) {
      recordPlayerNewsFetch(ctx.db, { playerId, attemptedAt, ok: true, itemCount });
    }
    return res;
  }

  async function targeted(ctx: JobContext, playerId: string): Promise<JobResult> {
    const espnId = readPlayerEspnIds(ctx.db, [playerId]).get(playerId);
    if (espnId === undefined) {
      recordPlayerNewsFetch(ctx.db, {
        playerId,
        attemptedAt: ctx.now().toISOString(),
        ok: true,
        itemCount: 0,
      });
      return { rowsChanged: 0, status: "skipped", note: `no ESPN id for ${playerId}` };
    }
    const rows = new Map<string, PlayerNewsRow>();
    const res = await forPlayer(ctx, [playerId], espnId, rows, ctx.now().toISOString());
    if (!res.ok)
      return { rowsChanged: 0, status: "skipped", note: "degraded: ESPN news unavailable" };
    return { rowsChanged: store(ctx, rows), note: `${rows.size} items for ${playerId}` };
  }

  return {
    name: "player_news",
    async run(ctx) {
      if (ctx.target) return targeted(ctx, ctx.target);
      const fetchedAt = ctx.now().toISOString();
      const rows = new Map<string, PlayerNewsRow>();
      let calls = 0;
      let failures = 0;

      // (a) The league-wide feed, matched to players by ESPN athlete id.
      // Two Sleeper players can share an ESPN id; each gets a row.
      const byEspn = new Map<string, string[]>();
      for (const [playerId, espnId] of readPlayerEspnIds(ctx.db)) {
        byEspn.set(espnId, [...(byEspn.get(espnId) ?? []), playerId]);
      }
      if (ctx.signal.aborted) return { rowsChanged: 0, status: "skipped", note: "aborted" };
      const recent = await fetchEspnRecentNews(opts(ctx));
      calls++;
      let stopEarly = false;
      if (recent.ok) {
        for (const w of recent.meta.warnings) ctx.logger.warn({ warning: w }, "ESPN news warning");
        for (const item of recent.data) {
          for (const athlete of item.espnAthleteIds) {
            for (const playerId of byEspn.get(athlete) ?? []) {
              const row = toRow(item, playerId, fetchedAt);
              rows.set(row.id, row);
            }
          }
        }
      } else {
        failures++;
        warn(ctx, "recent feed", recent);
        if (isHardStop(recent)) {
          stopEarly = true;
          ctx.logger.warn({ calls, failures }, "ESPN degraded, stopping early");
        }
      }

      // (b) Rostered players in the active league, a rotating slice per run.
      const leagueId = requireLeagueId(ctx);
      if (leagueId !== null && !stopEarly) {
        const espnIds = readPlayerEspnIds(ctx.db, [...readRosteredPlayerIds(ctx.db, leagueId)]);
        const ids = [...espnIds.keys()].sort();
        if (ids.length > 0) {
          const start = cursor % ids.length;
          const slice = Array.from({ length: Math.min(cap, ids.length) }, (_, i) => {
            return ids[(start + i) % ids.length];
          }).filter((id): id is string => id !== undefined);
          cursor = (start + slice.length) % ids.length;
          // Players sharing an ESPN id are fetched once and written for each.
          const byId = new Map<string, string[]>();
          for (const playerId of slice) {
            const espnId = espnIds.get(playerId);
            if (espnId !== undefined) byId.set(espnId, [...(byId.get(espnId) ?? []), playerId]);
          }
          let consecutive = 0;
          for (const [espnId, playerIds] of byId) {
            if (ctx.signal.aborted) break;
            calls++;
            const res = await forPlayer(ctx, playerIds, espnId, rows, fetchedAt);
            if (res.ok) {
              consecutive = 0;
              continue;
            }
            failures++;
            consecutive++;
            if (isHardStop(res) || consecutive >= MAX_CONSECUTIVE_FAILURES) {
              ctx.logger.warn({ calls, failures }, "ESPN degraded, stopping early");
              break;
            }
          }
        }
      }

      if (failures >= calls) {
        ctx.logger.warn({ calls }, "ESPN news degraded: every call failed");
        return {
          rowsChanged: store(ctx, new Map()),
          status: "skipped",
          note: "degraded: ESPN unavailable",
        };
      }
      const changed = store(ctx, rows);
      return {
        rowsChanged: changed,
        note: `${rows.size} items, ${calls} ESPN calls${failures > 0 ? `, ${failures} failed` : ""}`,
      };
    },
  };
}
