import { countPlayersWithEspnId, fillMissingEspnIds } from "@sideline/db";
import { getPlayerIdCrosswalk, type FetchFn } from "@sideline/providers";
import type { Job } from "../types.js";

export interface PlayerIdsJobDeps {
  /** Injected in tests and fixture mode; defaults to the global fetch. */
  fetch?: FetchFn;
}

/**
 * Fills missing `players.espn_id` from the DynastyProcess crosswalk (ADR-021). Never fails the
 * run: an unavailable crosswalk is a degraded skip.
 */
export function playerIdsJob(deps: PlayerIdsJobDeps = {}): Job {
  return {
    name: "player_ids",
    async run(ctx) {
      const before = countPlayersWithEspnId(ctx.db);
      if (before.players === 0) {
        return { rowsChanged: 0, status: "skipped", note: "no players stored yet" };
      }
      if (ctx.signal.aborted) return { rowsChanged: 0, status: "skipped", note: "aborted" };
      const res = await getPlayerIdCrosswalk({
        dataDir: ctx.config.dataDir,
        now: () => ctx.now(),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      if (!res.ok) {
        ctx.logger.warn({ reason: res.reason, message: res.message }, "player ids unavailable");
        return {
          rowsChanged: 0,
          status: "skipped",
          note: `degraded: player id crosswalk unavailable (${res.reason})`,
        };
      }
      for (const w of res.meta.warnings) ctx.logger.warn({ warning: w }, "player ids warning");
      const missing = before.players - before.withEspnId;
      const filled = fillMissingEspnIds(ctx.db, res.data);
      return { rowsChanged: filled, note: `filled ${filled} of ${missing} missing espn ids` };
    },
  };
}
