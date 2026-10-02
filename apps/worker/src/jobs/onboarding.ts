import {
  getSleeperUserId,
  getSleeperUsername,
  saveUserLeagues,
  setSleeperUserId,
  setSleeperUsername,
} from "@sideline/db";
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
  keepStoredUsername = false,
): Promise<number> {
  const client = makeClient(ctx, deps);
  checkAbort(ctx);
  const res = await client.getUser(params.username, callOpts(ctx));
  if (res.data === null) throw new Error(UNKNOWN_USER_MESSAGE);
  const canonical = (res.data.username ?? params.username).toLowerCase();
  setSleeperUserId(ctx.db, res.data.user_id);
  if (!keepStoredUsername) setSleeperUsername(ctx.db, canonical);
  return 1;
}

/** Username to look up (settings first, else env), or null when no lookup is needed or possible. */
export function userIdLookupUsername(
  db: JobContext["db"],
  envUsername: string | null,
): string | null {
  if ((getSleeperUserId(db) ?? "") !== "") return null;
  const stored = (getSleeperUsername(db) ?? "").trim();
  const raw = stored !== "" ? stored : (envUsername ?? "").trim();
  return raw === "" ? null : raw;
}

/**
 * Seeds sleeper_user_id when identity came from env and onboarding never ran (G2-B1). Username is
 * app_settings first, else the env value (the web's seeding rule). Does one lookup only when the id
 * is missing; never touches the stored username or active league. Never throws: a failed lookup
 * logs a warning and the caller carries on (no retry in the same cycle).
 */
export async function ensureSleeperUserId(
  ctx: JobContext,
  deps: SleeperJobDeps,
  envUsername: string | null,
): Promise<void> {
  try {
    const raw = userIdLookupUsername(ctx.db, envUsername);
    if (raw === null) return;
    const p = UserJobParamsSchema.safeParse({ username: raw });
    if (!p.success) {
      ctx.logger.warn({ reason: "invalid username" }, "could not resolve sleeper user id");
      return;
    }
    await runUser(ctx, deps, p.data, true);
    ctx.logger.info("resolved sleeper user id from configured username");
  } catch (e) {
    ctx.logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "could not resolve sleeper user id; continuing with league jobs",
    );
  }
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
