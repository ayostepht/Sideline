import {
  enqueue,
  getActiveLeagueId,
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
import { requestSyncForLeagueChange, requestSyncOn } from "./sync";

export type StartOnboardingResult =
  | { kind: "invalid_username" }
  | { kind: "started"; created: boolean; status: OnboardingStatus }
  | { kind: "worker_offline"; status: OnboardingStatus };

/** Stores the username and queues the `user` job. Enqueues nothing when the worker is offline. */
export function startOnboarding(h: DbHandle, username: string, now: Date): StartOnboardingResult {
  const parsed = UserJobParamsSchema.safeParse({ username });
  if (!parsed.success) return { kind: "invalid_username" };
  if (!isWorkerLive(h, now)) return { kind: "worker_offline", status: { phase: "worker_offline" } };
  const previous = getSleeperUsername(h);
  if (previous !== parsed.data.username) {
    // A different person: forget the previous user id so the new lookup decides.
    setSleeperUserId(h, null);
    // And forget their league so Home never shows it for the new user.
    if (previous !== null) setActiveLeagueId(h, null);
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

const UNKNOWN_USER = "No Sleeper user with that username";

/** Worker error text can carry URLs or usernames, so only fixed messages reach the UI. */
function requestError(r: SyncRequest): string {
  if (r.paramsError !== null && r.paramsError !== undefined) return "That username isn't valid";
  if (r.error?.includes(UNKNOWN_USER) === true) return UNKNOWN_USER;
  return "Couldn't reach Sleeper. Try again in a minute.";
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
  const season = readNflState(h)?.season ?? null;

  if (userReq === null) {
    if (
      season !== null &&
      userId !== null &&
      username !== null &&
      readUserLeagues(h, userId, season).length > 0
    ) {
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
  if (season === null) {
    // The season comes from nfl_state; make sure the worker fetches it (deduped).
    enqueue(h, "state", "api", now);
    return { phase: "loading_leagues", user: onboardingUser(h, userId, username) };
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
  | {
      kind: "selected";
      activeLeagueId: string;
      sync: "queued" | "pending_reused" | "rate_limited";
    };

/** Accepts only a league from the stored choices; sets it active and queues an `all` sync. */
export function selectLeague(h: DbHandle, leagueId: string, now: Date): SelectLeagueResult {
  const userId = getSleeperUserId(h);
  if (userId === null) return { kind: "invalid_league" };
  if (!readUserLeagues(h, userId).some((l) => l.leagueId === leagueId)) {
    return { kind: "invalid_league" };
  }
  const changed = getActiveLeagueId(h) !== leagueId;
  setActiveLeagueId(h, leagueId);
  // A league change is a state change: skip the debounce so the new league always gets synced.
  const res: ApiResult = changed
    ? requestSyncForLeagueChange(h, now)
    : requestSyncOn(h, "all", now);
  const sync =
    res.status === 429 ? "rate_limited" : res.status === 202 ? "queued" : "pending_reused";
  return { kind: "selected", activeLeagueId: leagueId, sync };
}
