import {
  readLeaguePlayoffWeekStart,
  readStoredMatchupWeeks,
  upsertLeague,
  upsertLeagueUsers,
  upsertMatchups,
  upsertRosters,
  upsertTransactions,
} from "@sideline/db";
import {
  mapLeague,
  mapLeagueUser,
  mapMatchup,
  mapRoster,
  mapState,
  mapTransaction,
} from "@sideline/sleeper";
import type { Job, JobResult } from "../types.js";
import {
  callOpts,
  checkAbort,
  loadState,
  makeClient,
  MAX_REGULAR_WEEK,
  NO_LEAGUE_MESSAGE,
  requireLeagueId,
  storeState,
  type SleeperJobDeps,
} from "./common.js";

const NO_LEAGUE: JobResult = {
  rowsChanged: 0,
  status: "skipped",
  note: NO_LEAGUE_MESSAGE,
};

/** Default Sleeper playoff start when the league does not say. */
const DEFAULT_PLAYOFF_START = 15;

export function stateJob(deps: SleeperJobDeps): Job {
  return {
    name: "state",
    async run(ctx) {
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      const res = await client.getState(callOpts(ctx));
      const out = storeState(ctx, mapState(res.data));
      return { rowsChanged: out.rowsChanged };
    },
  };
}

export function leagueJob(deps: SleeperJobDeps): Job {
  return {
    name: "league",
    async run(ctx) {
      const leagueId = requireLeagueId(ctx);
      if (leagueId === null) return NO_LEAGUE;
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      const res = await client.getLeague(leagueId, callOpts(ctx));
      const out = upsertLeague(ctx.db, mapLeague(res.data), ctx.now().toISOString());
      return { rowsChanged: out.rowsChanged };
    },
  };
}

export function usersJob(deps: SleeperJobDeps): Job {
  return {
    name: "users",
    async run(ctx) {
      const leagueId = requireLeagueId(ctx);
      if (leagueId === null) return NO_LEAGUE;
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      const res = await client.getLeagueUsers(leagueId, callOpts(ctx));
      const out = upsertLeagueUsers(
        ctx.db,
        res.data.map((u) => mapLeagueUser(u, leagueId)),
      );
      return { rowsChanged: out.rowsChanged };
    },
  };
}

export function rostersJob(deps: SleeperJobDeps): Job {
  return {
    name: "rosters",
    async run(ctx) {
      const leagueId = requireLeagueId(ctx);
      if (leagueId === null) return NO_LEAGUE;
      const client = makeClient(ctx, deps);
      checkAbort(ctx);
      const res = await client.getRosters(leagueId, callOpts(ctx));
      const out = upsertRosters(
        ctx.db,
        res.data.map((r) => mapRoster(r, leagueId)),
        ctx.now().toISOString(),
      );
      return { rowsChanged: out.rowsChanged };
    },
  };
}

/**
 * Weeks to fetch, in order: the current week, the previous week (final scores can land after the
 * week rolls over), every completed week not yet stored, then future weeks not yet stored up to
 * `playoff_week_start - 1`.
 */
export function matchupWeeksToFetch(
  current: number,
  playoffWeekStart: number | null,
  stored: ReadonlySet<number>,
): number[] {
  const weeks: number[] = [current];
  if (current > 1) weeks.push(current - 1);
  for (let w = 1; w < current - 1; w++) if (!stored.has(w)) weeks.push(w);
  const last = Math.min(MAX_REGULAR_WEEK, (playoffWeekStart ?? DEFAULT_PLAYOFF_START) - 1);
  for (let w = current + 1; w <= last; w++) if (!stored.has(w)) weeks.push(w);
  return weeks;
}

export function matchupsJob(deps: SleeperJobDeps): Job {
  return {
    name: "matchups",
    async run(ctx) {
      const leagueId = requireLeagueId(ctx);
      if (leagueId === null) return NO_LEAGUE;
      const client = makeClient(ctx, deps);
      const state = await loadState(ctx, client);
      const current = Math.min(MAX_REGULAR_WEEK, Math.max(1, state.week));
      const weeks = matchupWeeksToFetch(
        current,
        readLeaguePlayoffWeekStart(ctx.db, leagueId),
        readStoredMatchupWeeks(ctx.db, leagueId),
      );
      let rowsChanged = 0;
      for (const week of weeks) {
        checkAbort(ctx);
        const res = await client.getMatchups(leagueId, week, callOpts(ctx));
        rowsChanged += upsertMatchups(
          ctx.db,
          res.data.map((m) => mapMatchup(m, leagueId, week)),
        ).rowsChanged;
      }
      return { rowsChanged, note: `weeks ${weeks.join(",")}` };
    },
  };
}

export function transactionsJob(deps: SleeperJobDeps): Job {
  return {
    name: "transactions",
    async run(ctx) {
      const leagueId = requireLeagueId(ctx);
      if (leagueId === null) return NO_LEAGUE;
      const client = makeClient(ctx, deps);
      const state = await loadState(ctx, client);
      const current = Math.min(MAX_REGULAR_WEEK, Math.max(1, state.week));
      const weeks = current > 1 ? [current, current - 1] : [current];
      let rowsChanged = 0;
      for (const week of weeks) {
        checkAbort(ctx);
        const res = await client.getTransactions(leagueId, week, callOpts(ctx));
        rowsChanged += upsertTransactions(
          ctx.db,
          res.data.map((t) => mapTransaction(t, leagueId)),
        ).rowsChanged;
      }
      return { rowsChanged };
    },
  };
}
