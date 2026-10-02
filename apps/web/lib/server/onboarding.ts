import {
  getRequest,
  getSleeperUserId,
  getSleeperUsername,
  readNflState,
  readUserLeagues,
  enqueueWithParams,
  setActiveLeagueId,
  setSleeperUserId,
  setSleeperUsername,
  type DbHandle,
} from "@sideline/db";
import {
  UserJobParamsSchema,
  type OnboardingStatus,
  type OnboardingUser,
  type SyncRequest,
} from "@sideline/shared";
import { isWorkerLive } from "./health";
import type { ApiResult } from "./http";
import { requestSyncOn } from "./sync";

export type StartOnboardingResult =
  | { kind: "invalid_username" }
  | { kind: "started"; created: boolean; status: OnboardingStatus }
  | { kind: "worker_offline"; status: OnboardingStatus };

/** Stores the username and queues the `user` job. Enqueues nothing when the worker is offline. */
export function startOnboarding(h: DbHandle, username: string, now: Date): StartOnboardingResult {
  const parsed = UserJobParamsSchema.safeParse({ username });
  if (!parsed.success) return { kind: "invalid_username" };
  if (!isWorkerLive(h, now)) return { kind: "worker_offline", status: { phase: "worker_offline" } };
  if (getSleeperUsername(h) !== parsed.data.username) {
    // A different person: forget the previous user id so the new lookup decides.
    setSleeperUserId(h, null);
  }
  setSleeperUsername(h, parsed.data.username);
  const { created } = enqueueWithParams(h, "user", parsed.data, "api", now);
  return { kind: "started", created, status: { phase: "resolving_user" } };
}

function latestRequest(h: DbHandle, job: string): SyncRequest | null {
  const row = h.sqlite
    .prepare("SELECT id FROM sync_requests WHERE job = ? ORDER BY id DESC LIMIT 1")
    .get(job) as { id: number } | undefined;
  return row === undefined ? null : getRequest(h, row.id);
}

function requestError(r: SyncRequest): string {
  return r.paramsError ?? r.error ?? "The lookup failed.";
}

function currentSeason(h: DbHandle, now: Date): number {
  return readNflState(h)?.season ?? now.getUTCFullYear();
}

function onboardingUser(h: DbHandle, userId: string, username: string): OnboardingUser {
  const row = h.sqlite
    .prepare("SELECT display_name AS name FROM league_users WHERE user_id = ? LIMIT 1")
    .get(userId) as { name: string } | undefined;
  return { userId, username, displayName: row?.name ?? username };
}

/** Derives the phase from the latest requests and stored data. Queues `user_leagues` once `user` is done. */
export function getOnboardingStatus(h: DbHandle, now: Date): OnboardingStatus {
  const userReq = latestRequest(h, "user");
  const username = getSleeperUsername(h);
  const userId = getSleeperUserId(h);
  const season = currentSeason(h, now);

  if (userReq === null) {
    if (userId !== null && username !== null && readUserLeagues(h, userId, season).length > 0) {
      return {
        phase: "ready",
        user: onboardingUser(h, userId, username),
        leagues: readUserLeagues(h, userId, season),
      };
    }
    return { phase: "idle" };
  }
  if (userReq.status === "failed") return { phase: "failed", error: requestError(userReq) };
  if (userReq.status === "pending" || userReq.status === "running") {
    return !isWorkerLive(h, now) && userReq.status === "pending"
      ? { phase: "worker_offline" }
      : { phase: "resolving_user" };
  }
  // user request done
  if (userId === null || username === null) {
    return { phase: "failed", error: "The user lookup finished but no user was stored." };
  }
  let leaguesReq = latestRequest(h, "user_leagues");
  const matches =
    leaguesReq !== null &&
    leaguesReq.id > userReq.id &&
    leaguesReq.params !== null &&
    leaguesReq.params !== undefined &&
    "userId" in leaguesReq.params &&
    leaguesReq.params.userId === userId &&
    leaguesReq.params.season === season;
  if (!matches) {
    const { request } = enqueueWithParams(h, "user_leagues", { userId, season }, "api", now);
    leaguesReq = request;
  }
  if (leaguesReq === null) return { phase: "loading_leagues" }; // unreachable: set above
  const user = onboardingUser(h, userId, username);
  if (leaguesReq.status === "failed") return { phase: "failed", error: requestError(leaguesReq) };
  if (leaguesReq.status === "done") {
    return { phase: "ready", user, leagues: readUserLeagues(h, userId, season) };
  }
  return { phase: "loading_leagues", user };
}

export type SelectLeagueResult =
  | { kind: "invalid_league" }
  | { kind: "selected"; activeLeagueId: string; sync: "queued" | "deduplicated" | "rate_limited" };

/** Accepts only a league from the stored choices; sets it active and queues an `all` sync. */
export function selectLeague(h: DbHandle, leagueId: string, now: Date): SelectLeagueResult {
  const userId = getSleeperUserId(h);
  if (userId === null) return { kind: "invalid_league" };
  if (!readUserLeagues(h, userId).some((l) => l.leagueId === leagueId)) {
    return { kind: "invalid_league" };
  }
  setActiveLeagueId(h, leagueId);
  const res: ApiResult = requestSyncOn(h, "all", now);
  const sync = res.status === 429 ? "rate_limited" : res.status === 202 ? "queued" : "deduplicated";
  return { kind: "selected", activeLeagueId: leagueId, sync };
}
