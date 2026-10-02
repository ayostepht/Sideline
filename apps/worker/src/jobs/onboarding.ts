import { saveUserLeagues, setSleeperUserId, setSleeperUsername } from "@sideline/db";
import {
  UserJobParamsSchema,
  UserLeaguesJobParamsSchema,
  type LeagueChoice,
  type OnboardingJobName,
  type UserJobParams,
  type UserLeaguesJobParams,
} from "@sideline/shared";
import { callOpts, checkAbort, makeClient, type SleeperJobDeps } from "./common.js";
import type { JobContext } from "../types.js";

export const UNKNOWN_USER_MESSAGE = "No Sleeper user with that username";

/** Sleeper's league status for NFL leagues is stored as-is; avatar is not in the raw schema. */
async function runUser(
  ctx: JobContext,
  deps: SleeperJobDeps,
  params: UserJobParams,
): Promise<number> {
  const client = makeClient(ctx, deps);
  checkAbort(ctx);
  const res = await client.getUser(params.username, callOpts(ctx));
  if (res.data === null) throw new Error(UNKNOWN_USER_MESSAGE);
  const canonical = (res.data.username ?? params.username).toLowerCase();
  setSleeperUserId(ctx.db, res.data.user_id);
  setSleeperUsername(ctx.db, canonical);
  return 1;
}

async function runUserLeagues(
  ctx: JobContext,
  deps: SleeperJobDeps,
  params: UserLeaguesJobParams,
): Promise<number> {
  const client = makeClient(ctx, deps);
  checkAbort(ctx);
  const res = await client.getUserLeagues(params.userId, params.season, callOpts(ctx));
  const leagues: LeagueChoice[] = res.data
    .filter((l) => Number(l.season) === params.season)
    .map((l) => ({
      leagueId: l.league_id,
      name: l.name,
      season: params.season,
      totalRosters: l.total_rosters,
      status: l.status,
      avatar: null,
    }));
  saveUserLeagues(ctx.db, params.userId, params.season, leagues, ctx.now());
  return leagues.length;
}

/**
 * Runs an onboarding job (ADR-009). Throws on failure; the caller marks the request failed. These
 * jobs are on-demand only and are never part of the scheduled or "all" sets.
 */
export async function runOnboardingJob(
  ctx: JobContext,
  deps: SleeperJobDeps,
  job: OnboardingJobName,
  rawParams: unknown,
): Promise<number> {
  if (job === "user") {
    const p = UserJobParamsSchema.safeParse(rawParams);
    if (!p.success) throw new Error("invalid params for user");
    return runUser(ctx, deps, p.data);
  }
  const p = UserLeaguesJobParamsSchema.safeParse(rawParams);
  if (!p.success) throw new Error("invalid params for user_leagues");
  return runUserLeagues(ctx, deps, p.data);
}
