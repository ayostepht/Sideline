import { readNflState, upsertSchedule, upsertUsageWeek } from "@sideline/db";
import {
  createNflverseProvider,
  type FetchFn,
  type NflverseProvider,
  type PlayerRef,
} from "@sideline/providers";
import type { ScheduleGame } from "@sideline/shared";
import { fallbackKickoffUtc } from "../kickoff.js";
import type { Job, JobContext, JobResult } from "../types.js";

export interface NflverseJobDeps {
  /** Injected in tests and by db:seed:fixtures; defaults to the global fetch. */
  fetch?: FetchFn;
  /** Test seam: replaces the real provider. */
  provider?: (ctx: JobContext) => NflverseProvider;
}

/**
 * Applies ADR-002 item 6 to games the provider could not time: kickoff 13:00 ET (Sunday) or 20:00 ET
 * (other days) on the game date, stored with kickoffApproximate true. Games with a real kickoff, or
 * with no usable date, pass through unchanged.
 */
export function applyKickoffFallback(
  games: readonly ScheduleGame[],
  gamedays: ReadonlyMap<string, string>,
): ScheduleGame[] {
  return games.map((g) => {
    if (g.kickoffUtc !== null) return g;
    const day = gamedays.get(g.gameId);
    const kickoff = day === undefined ? null : fallbackKickoffUtc(day);
    return kickoff === null ? g : { ...g, kickoffUtc: kickoff, kickoffApproximate: true };
  });
}

/** The job ends "skipped" with a `degraded:` note; the other jobs are unaffected. */
function degraded(ctx: JobContext, why: string): JobResult {
  ctx.logger.warn({ reason: why }, "nflverse degraded: schedule not updated");
  return { rowsChanged: 0, status: "skipped", note: `degraded: ${why}` };
}

/**
 * Fetches one season's schedule via the nflverse provider, applies the kickoff fallback, and
 * upserts it. Shared by `nflverseJob` (always the current season) and `backfillJob` (the fixed
 * 2025 backfill season), so both degrade the same way instead of failing the caller's job.
 */
export async function syncScheduleForSeason(
  ctx: JobContext,
  deps: NflverseJobDeps,
  season: number,
): Promise<JobResult> {
  if (!ctx.config.enableNflverse) return degraded(ctx, "ENABLE_NFLVERSE is off");
  const provider =
    deps.provider?.(ctx) ??
    createNflverseProvider({
      enabled: true,
      dataDir: ctx.config.dataDir,
      now: () => ctx.now(),
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
  let res;
  try {
    res = await provider.getScheduleWithDates(season);
  } catch (e) {
    return degraded(ctx, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) return degraded(ctx, `${res.reason}: ${res.message}`);
  for (const w of res.meta.warnings) ctx.logger.warn({ warning: w }, "nflverse warning");
  const games = applyKickoffFallback(res.data.games, res.data.gamedays);
  const out = upsertSchedule(ctx.db, games);
  const approx = games.filter((g) => g.kickoffApproximate).length;
  return {
    rowsChanged: out.rowsChanged,
    note: `${games.length} games${approx > 0 ? `, ${approx} with approximate kickoff` : ""}`,
  };
}

function makeProvider(ctx: JobContext, deps: NflverseJobDeps): NflverseProvider {
  return (
    deps.provider?.(ctx) ??
    createNflverseProvider({
      enabled: true,
      dataDir: ctx.config.dataDir,
      now: () => ctx.now(),
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    })
  );
}

function readPlayerRefs(ctx: JobContext): PlayerRef[] {
  const rows = ctx.db.sqlite
    .prepare("SELECT player_id, full_name, team, position, gsis_id FROM players")
    .all() as {
    player_id: string;
    full_name: string;
    team: string | null;
    position: string | null;
    gsis_id: string | null;
  }[];
  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    team: r.team,
    position: r.position,
    gsisId: r.gsis_id,
  }));
}

/**
 * Downloads nflverse weekly stats and snap counts for one season (through the provider's
 * download cache), joins them to Sleeper players, and upserts `usage_week` in one short
 * transaction. Never throws: any problem logs a warning and returns zero rows so the schedule
 * sync that precedes it is unaffected.
 */
export async function syncUsageForSeason(
  ctx: JobContext,
  deps: NflverseJobDeps,
  season: number,
): Promise<{ rowsChanged: number; note: string }> {
  if (!ctx.config.enableNflverse) return { rowsChanged: 0, note: "usage: nflverse off" };
  try {
    const players = readPlayerRefs(ctx);
    if (players.length === 0) {
      ctx.logger.warn({ season }, "usage skipped: no players stored yet");
      return { rowsChanged: 0, note: "usage: no players stored yet" };
    }
    const res = await makeProvider(ctx, deps).getUsage(season, undefined, players);
    if (!res.ok) {
      ctx.logger.warn({ season, reason: res.reason, message: res.message }, "usage degraded");
      return { rowsChanged: 0, note: `usage degraded: ${res.reason}` };
    }
    for (const w of res.meta.warnings) ctx.logger.warn({ warning: w }, "nflverse usage warning");
    // No network inside the transaction.
    const out = ctx.db.sqlite.transaction(() => upsertUsageWeek(ctx.db, res.data)).immediate();
    return { rowsChanged: out.rowsChanged, note: `${res.data.length} usage rows` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.logger.warn({ season, message }, "usage degraded");
    return { rowsChanged: 0, note: "usage degraded: error" };
  }
}

export function nflverseJob(deps: NflverseJobDeps = {}): Job {
  return {
    name: "nflverse",
    async run(ctx) {
      const season = readNflState(ctx.db)?.season ?? ctx.now().getUTCFullYear();
      const sched = await syncScheduleForSeason(ctx, deps, season);
      const usage = await syncUsageForSeason(ctx, deps, season);
      return {
        ...sched,
        rowsChanged: sched.rowsChanged + usage.rowsChanged,
        note: [sched.note, usage.note].filter(Boolean).join("; "),
      };
    },
  };
}
