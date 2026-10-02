import type { DbHandle } from "@sideline/db";
import type { SyncJobName } from "@sideline/shared";
import type { Logger } from "pino";

/**
 * Called after a sync run that changed rows. `changedTables` holds the table names written by jobs
 * that reported changed rows. Hooks recompute derived tables (analytics registers them in T3.2).
 */
export type RecomputeHook = (
  db: DbHandle,
  changedTables: ReadonlySet<string>,
) => void | Promise<void>;

export interface RecomputeRegistry {
  register(hook: RecomputeHook): () => void;
  /** Runs every hook in registration order. A throwing hook is logged; the rest still run. */
  run(db: DbHandle, changedTables: ReadonlySet<string>, logger: Logger): Promise<void>;
  size(): number;
}

export function createRecomputeRegistry(): RecomputeRegistry {
  const hooks: RecomputeHook[] = [];
  return {
    register(hook) {
      hooks.push(hook);
      return () => {
        const i = hooks.indexOf(hook);
        if (i >= 0) hooks.splice(i, 1);
      };
    },
    async run(db, changedTables, logger) {
      if (changedTables.size === 0) return;
      for (const hook of [...hooks]) {
        try {
          await hook(db, changedTables);
        } catch (e) {
          logger.error(
            { err: e instanceof Error ? e.message : String(e) },
            "recompute hook failed",
          );
        }
      }
    },
    size: () => hooks.length,
  };
}

/** Process-wide registry. Empty until analytics registers its hooks. */
export const recomputeHooks: RecomputeRegistry = createRecomputeRegistry();

/** Tables each job writes (backfill and stats write the same ones). */
export const JOB_TABLES: Readonly<Record<SyncJobName, readonly string[]>> = {
  state: ["nfl_state"],
  league: ["leagues"],
  users: ["league_users"],
  rosters: ["rosters"],
  matchups: ["matchups"],
  transactions: ["transactions"],
  players: ["players"],
  trending: ["trending"],
  stats: ["player_week_stats"],
  projections: ["player_week_projections", "player_week_projection_snapshots"],
  nflverse: ["schedule"],
  backfill_2025: ["player_week_stats", "player_week_projections"],
};
