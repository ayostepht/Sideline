import { upsertSchedule } from "@sideline/db";
import { createNflverseProvider, type FetchFn, type NflverseProvider } from "@sideline/providers";
import type { ScheduleGame } from "@sideline/shared";
import { fallbackKickoffUtc } from "../kickoff.js";
import type { Job, JobContext, JobResult } from "../types.js";
import { readState } from "./db-reads.js";

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

export function nflverseJob(deps: NflverseJobDeps = {}): Job {
  return {
    name: "nflverse",
    async run(ctx) {
      if (!ctx.config.enableNflverse) return degraded(ctx, "ENABLE_NFLVERSE is off");
      const provider =
        deps.provider?.(ctx) ??
        createNflverseProvider({
          enabled: true,
          dataDir: ctx.config.dataDir,
          now: () => ctx.now(),
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        });
      const season = readState(ctx.db)?.season ?? ctx.now().getUTCFullYear();
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
    },
  };
}
