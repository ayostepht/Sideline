import {
  claimNext,
  complete,
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  saveUserLeagues,
  setSleeperUserId,
  setSleeperUsername,
  writeHeartbeat,
  type DbHandle,
} from "@sideline/db";
import { OnboardingStatusSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getIdentity, getSettings } from "./identity";
import { getOnboardingStatus, selectLeague, startOnboarding } from "./onboarding";
import { SEED_NOW } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});
function setup(live = true): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  if (live) writeHeartbeat(h, new Date(SEED_NOW.getTime() - 10_000));
  return h;
}
const CHOICES = [
  {
    leagueId: "L1",
    name: "League One",
    season: 2026,
    totalRosters: 12,
    status: "in_season",
    avatar: null,
  },
  {
    leagueId: "L2",
    name: "League Two",
    season: 2026,
    totalRosters: 10,
    status: "pre_draft",
    avatar: null,
  },
];
/** Plays the worker: runs the oldest pending request to done or failed. */
function workerFinish(h: DbHandle, status: "done" | "failed", error: string | null = null) {
  const r = claimNext(h, SEED_NOW);
  if (r === null) throw new Error("nothing pending");
  complete(h, r.id, status, error, SEED_NOW);
  return r;
}
const status = (h: DbHandle) => OnboardingStatusSchema.parse(getOnboardingStatus(h, SEED_NOW));

describe("identity", () => {
  it("seeds from env once, then the DB wins", () => {
    const h = setup();
    const env = { SLEEPER_USERNAME: " Fake_User ", DEFAULT_LEAGUE_ID: "L9" };
    expect(getIdentity(h, env)).toMatchObject({
      sleeperUsername: "fake_user",
      activeLeagueId: "L9",
    });
    setSleeperUsername(h, "someone_else");
    expect(getSettings(h, env)).toEqual({
      sleeperUsername: "someone_else",
      sleeperUserId: null,
      activeLeagueId: "L9",
    });
  });
  it("ignores empty or invalid env values", () => {
    const h = setup();
    expect(getIdentity(h, { SLEEPER_USERNAME: "bad name!", DEFAULT_LEAGUE_ID: " " })).toEqual({
      sleeperUsername: null,
      sleeperUserId: null,
      activeLeagueId: null,
    });
  });
});

describe("onboarding", () => {
  it("is idle before any start", () => {
    expect(status(setup())).toEqual({ phase: "idle" });
  });
  it("reports worker_offline at start and enqueues nothing", () => {
    const h = setup(false);
    expect(startOnboarding(h, "fake_user", SEED_NOW)).toEqual({
      kind: "worker_offline",
      status: { phase: "worker_offline" },
    });
    expect(h.sqlite.prepare("SELECT count(*) AS n FROM sync_requests").get()).toEqual({ n: 0 });
    expect(getSleeperUsername(h)).toBeNull();
  });
  it("rejects an invalid username", () => {
    expect(startOnboarding(setup(), "no spaces", SEED_NOW)).toEqual({ kind: "invalid_username" });
  });
  it("dedupes a duplicate start and lowercases the username", () => {
    const h = setup();
    const a = startOnboarding(h, "Fake_User", SEED_NOW);
    const b = startOnboarding(h, "fake_user", SEED_NOW);
    expect(a).toMatchObject({ kind: "started", created: true });
    expect(b).toMatchObject({ kind: "started", created: false });
    expect(getSleeperUsername(h)).toBe("fake_user");
    expect(h.sqlite.prepare("SELECT count(*) AS n FROM sync_requests").get()).toEqual({ n: 1 });
  });
  it("walks resolving_user, loading_leagues, ready", () => {
    const h = setup();
    startOnboarding(h, "fake_user", SEED_NOW);
    expect(status(h)).toEqual({ phase: "resolving_user" });
    setSleeperUserId(h, "u7");
    workerFinish(h, "done");
    expect(status(h)).toMatchObject({
      phase: "loading_leagues",
      user: { userId: "u7", username: "fake_user" },
    });
    // polling again does not queue a second user_leagues request
    status(h);
    expect(
      h.sqlite.prepare("SELECT count(*) AS n FROM sync_requests WHERE job = 'user_leagues'").get(),
    ).toEqual({ n: 1 });
    expect(
      h.sqlite
        .prepare("SELECT params_json AS p FROM sync_requests WHERE job = 'user_leagues'")
        .get(),
    ).toEqual({
      p: JSON.stringify({ userId: "u7", season: 2026 }),
    });
    saveUserLeagues(h, "u7", 2026, CHOICES, SEED_NOW);
    workerFinish(h, "done");
    const ready = status(h);
    expect(ready).toMatchObject({ phase: "ready", user: { displayName: "fake_user" } });
    if (ready.phase === "ready") expect(ready.leagues.map((l) => l.leagueId)).toEqual(["L1", "L2"]);
  });
  it("uses the nfl state season for the leagues job", () => {
    const h = setup();
    h.sqlite
      .prepare(
        "INSERT INTO nfl_state (id, season, week, season_type, display_week, leg, fetched_at) VALUES (1, 2031, 1, 'regular', 1, 1, 'x')",
      )
      .run();
    startOnboarding(h, "fake_user", SEED_NOW);
    setSleeperUserId(h, "u7");
    workerFinish(h, "done");
    status(h);
    expect(
      h.sqlite
        .prepare("SELECT params_json AS p FROM sync_requests WHERE job = 'user_leagues'")
        .get(),
    ).toEqual({
      p: JSON.stringify({ userId: "u7", season: 2031 }),
    });
  });
  it("is worker_offline when a pending user request has no live worker", () => {
    const h = setup();
    startOnboarding(h, "fake_user", SEED_NOW);
    h.sqlite.prepare("DELETE FROM app_settings WHERE key = 'worker_heartbeat'").run();
    expect(status(h)).toEqual({ phase: "worker_offline" });
  });
  it("carries a failed user job error", () => {
    const h = setup();
    startOnboarding(h, "fake_user", SEED_NOW);
    workerFinish(h, "failed", "User not found");
    expect(status(h)).toEqual({ phase: "failed", error: "User not found" });
  });
  it("carries a params error and a done job with no stored user", () => {
    const h = setup();
    h.sqlite
      .prepare(
        "INSERT INTO sync_requests (job, params_json, requested_at, status, source) VALUES ('user', NULL, 'x', 'failed', 'api')",
      )
      .run();
    expect(status(h)).toEqual({ phase: "failed", error: "missing params for job user" });
    startOnboarding(h, "fake_user", SEED_NOW);
    workerFinish(h, "done");
    expect(status(h).phase).toBe("failed");
  });
  it("carries a failed leagues job and recovers on restart", () => {
    const h = setup();
    startOnboarding(h, "fake_user", SEED_NOW);
    setSleeperUserId(h, "u7");
    workerFinish(h, "done");
    status(h);
    workerFinish(h, "failed", "Sleeper unavailable");
    expect(status(h)).toEqual({ phase: "failed", error: "Sleeper unavailable" });
    h.sqlite.prepare("UPDATE sync_requests SET status = 'done' WHERE job = 'user'").run();
    startOnboarding(h, "fake_user", SEED_NOW);
    expect(status(h)).toEqual({ phase: "resolving_user" });
  });
  it("is ready from stored data when no request exists", () => {
    const h = setup();
    setSleeperUsername(h, "fake_user");
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, SEED_NOW);
    h.sqlite
      .prepare(
        "INSERT INTO nfl_state (id, season, week, season_type, display_week, leg, fetched_at) VALUES (1, 2026, 1, 'regular', 1, 1, 'x')",
      )
      .run();
    expect(status(h).phase).toBe("ready");
  });
  it("changing username forgets the old user id", () => {
    const h = setup();
    setSleeperUsername(h, "old_user");
    setSleeperUserId(h, "u1");
    startOnboarding(h, "new_user", SEED_NOW);
    expect(getSleeperUserId(h)).toBeNull();
  });
});

describe("selectLeague", () => {
  it("rejects a league outside the stored choices and when no user is stored", () => {
    const h = setup();
    expect(selectLeague(h, "L1", SEED_NOW)).toEqual({ kind: "invalid_league" });
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, SEED_NOW);
    expect(selectLeague(h, "L99", SEED_NOW)).toEqual({ kind: "invalid_league" });
    expect(getActiveLeagueId(h)).toBeNull();
  });
  it("stores the league and queues one all sync, then reports dedupe and rate limit", () => {
    const h = setup();
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, SEED_NOW);
    expect(selectLeague(h, "L2", SEED_NOW)).toEqual({
      kind: "selected",
      activeLeagueId: "L2",
      sync: "queued",
    });
    expect(getActiveLeagueId(h)).toBe("L2");
    expect(selectLeague(h, "L1", SEED_NOW)).toMatchObject({ sync: "deduplicated" });
    workerFinish(h, "done");
    expect(selectLeague(h, "L1", SEED_NOW)).toMatchObject({ sync: "rate_limited" });
    expect(getActiveLeagueId(h)).toBe("L1");
  });
});
