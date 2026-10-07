import {
  prunePlayerNews,
  readPlayerEspnIds,
  readRosteredPlayerIds,
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
}

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

  const opts = (ctx: JobContext) => ({
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    now: () => ctx.now(),
    limiter,
  });

  function warn(ctx: JobContext, what: string, res: ProviderResult<unknown>): void {
    if (!res.ok) ctx.logger.warn({ what, reason: res.reason, message: res.message }, "ESPN news");
  }

  async function forPlayer(
    ctx: JobContext,
    playerId: string,
    espnId: string,
    rows: Map<string, PlayerNewsRow>,
    fetchedAt: string,
  ): Promise<boolean> {
    const res = await fetchEspnPlayerNews(espnId, opts(ctx));
    if (!res.ok) {
      warn(ctx, `player ${playerId}`, res);
      return false;
    }
    // The request was for this player, so every returned item belongs to them.
    for (const item of res.data) {
      const row = toRow(item, playerId, fetchedAt);
      rows.set(row.id, row);
    }
    return true;
  }

  async function targeted(ctx: JobContext, playerId: string): Promise<JobResult> {
    const espnId = readPlayerEspnIds(ctx.db, [playerId]).get(playerId);
    if (espnId === undefined) {
      return { rowsChanged: 0, status: "skipped", note: `no ESPN id for ${playerId}` };
    }
    const rows = new Map<string, PlayerNewsRow>();
    const ok = await forPlayer(ctx, playerId, espnId, rows, ctx.now().toISOString());
    if (!ok) return { rowsChanged: 0, status: "skipped", note: "degraded: ESPN news unavailable" };
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
      const byEspn = new Map<string, string>();
      for (const [playerId, espnId] of readPlayerEspnIds(ctx.db)) byEspn.set(espnId, playerId);
      const recent = await fetchEspnRecentNews(opts(ctx));
      calls++;
      if (recent.ok) {
        for (const w of recent.meta.warnings) ctx.logger.warn({ warning: w }, "ESPN news warning");
        for (const item of recent.data) {
          for (const athlete of item.espnAthleteIds) {
            const playerId = byEspn.get(athlete);
            if (playerId === undefined) continue;
            const row = toRow(item, playerId, fetchedAt);
            rows.set(row.id, row);
          }
        }
      } else {
        failures++;
        warn(ctx, "recent feed", recent);
      }

      // (b) Rostered players in the active league, a rotating slice per run.
      const leagueId = requireLeagueId(ctx);
      if (leagueId !== null) {
        const espnIds = readPlayerEspnIds(ctx.db, [...readRosteredPlayerIds(ctx.db, leagueId)]);
        const ids = [...espnIds.keys()].sort();
        if (ids.length > 0) {
          const start = cursor % ids.length;
          const slice = Array.from({ length: Math.min(cap, ids.length) }, (_, i) => {
            return ids[(start + i) % ids.length] as string;
          });
          cursor = (start + slice.length) % ids.length;
          for (const playerId of slice) {
            if (ctx.signal.aborted) break;
            calls++;
            const ok = await forPlayer(
              ctx,
              playerId,
              espnIds.get(playerId) as string,
              rows,
              fetchedAt,
            );
            if (!ok) failures++;
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
