import {
  enqueue,
  enqueueWithParams,
  getActiveLeagueId,
  getRequest,
  getSleeperUserId,
  getSleeperUsername,
  readUserLeagues,
  setActiveLeagueId,
} from "@sideline/db";
import { RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "./fixture-fetch.js";
import { assertFixtureModeAllowed, fixtureFetchFromEnv } from "./fixture-mode.js";
import { requireLeagueId } from "./jobs/common.js";
import { createSleeperJobs } from "./jobs/index.js";
import { LeaseKeeper } from "./lease.js";
import { ALL_ORDER, createJobRegistry } from "./registry.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "./testutil.js";
import { createCallCounter } from "@sideline/sleeper";
import type { JobContext } from "./types.js";
import { Worker } from "./worker.js";
import pino from "pino";

// Sanitized fixture identity (tests/fixtures/sleeper/manifest.json).
const FIXTURE_USERNAME = "manager_04";
const FIXTURE_USER_ID = "100000000000000004";
const FIXTURE_LEAGUE_ID = "1000000000000000001";
const SEASON = 2026;

const fast = (): RateLimiter => new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100000 });

function setup(fetchImpl: typeof fetch, env: Record<string, string> = {}) {
  const dir = tempDataDir();
  const db = tempDb(dir);
  const clock = fakeClock("2026-10-01T12:00:00Z");
  const lease = new LeaseKeeper(db, "w1", clock.now);
  const urls: string[] = [];
  const counting: typeof fetch = (input, init) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return fetchImpl(input, init);
  };
  const worker = new Worker({
    db,
    config: testConfig(dir, env),
    registry: createJobRegistry(createSleeperJobs({ fetch: counting })),
    limiter: fast(),
    logger: silent,
    lease,
    now: clock.now,
    sleeper: { fetch: counting },
    loadGames: () => [],
  });
  worker.acquireTick();
  return { db, clock, worker, urls };
}

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );

describe("onboarding jobs", () => {
  it("user: stores id and canonical username (case-insensitive lookup)", async () => {
    const s = setup(createFixtureFetch());
    const { request } = enqueueWithParams(
      s.db,
      "user",
      { username: "  Manager_04 " },
      "api",
      s.clock.now(),
    );
    await s.worker.pollTick();
    expect(getRequest(s.db, request.id)).toMatchObject({ status: "done", error: null });
    expect(getSleeperUserId(s.db)).toBe(FIXTURE_USER_ID);
    expect(getSleeperUsername(s.db)).toBe(FIXTURE_USERNAME);
    expect(s.urls).toEqual([`https://api.sleeper.app/v1/user/${FIXTURE_USERNAME}`]);
  });

  it("user: unknown username (null body) fails the request with a clear message", async () => {
    const s = setup(() => json(null));
    const { request } = enqueueWithParams(
      s.db,
      "user",
      { username: "nobody" },
      "api",
      s.clock.now(),
    );
    await s.worker.pollTick();
    expect(getRequest(s.db, request.id)).toMatchObject({
      status: "failed",
      error: "No Sleeper user with that username",
    });
    expect(getSleeperUserId(s.db)).toBeNull();
  });

  it("user: a Sleeper 5xx fails the request and the worker keeps polling", async () => {
    let n = 0;
    const s = setup(() => {
      n++;
      return json({ error: "down" }, 503);
    });
    const a = enqueueWithParams(s.db, "user", { username: "someone" }, "api", s.clock.now());
    await s.worker.pollTick();
    expect(getRequest(s.db, a.request.id)?.status).toBe("failed");
    expect(n).toBeGreaterThan(1);
    const b = enqueueWithParams(s.db, "user", { username: "other" }, "api", s.clock.now());
    await s.worker.pollTick();
    expect(getRequest(s.db, b.request.id)?.status).toBe("failed");
  }, 60_000);

  it("user_leagues: saves the user's leagues for the season", async () => {
    const s = setup(createFixtureFetch());
    const { request } = enqueueWithParams(
      s.db,
      "user_leagues",
      { userId: FIXTURE_USER_ID, season: SEASON },
      "api",
      s.clock.now(),
    );
    await s.worker.pollTick();
    expect(getRequest(s.db, request.id)?.status).toBe("done");
    const leagues = readUserLeagues(s.db, FIXTURE_USER_ID, SEASON);
    expect(leagues.map((l) => l.leagueId)).toContain(FIXTURE_LEAGUE_ID);
    expect(leagues.every((l) => l.season === SEASON)).toBe(true);
    expect(s.urls).toEqual([
      `https://api.sleeper.app/v1/user/${FIXTURE_USER_ID}/leagues/nfl/${SEASON}`,
    ]);
  });

  it("user_leagues: zero leagues is success with an empty list", async () => {
    const s = setup(() => json([]));
    const { request } = enqueueWithParams(
      s.db,
      "user_leagues",
      { userId: "u9", season: SEASON },
      "api",
      s.clock.now(),
    );
    await s.worker.pollTick();
    expect(getRequest(s.db, request.id)).toMatchObject({ status: "done", error: null });
    expect(readUserLeagues(s.db, "u9", SEASON)).toEqual([]);
  });

  it("params error fails the request with that message and makes no Sleeper call", async () => {
    const s = setup(createFixtureFetch());
    const r = enqueue(s.db, "user", "api", s.clock.now()); // no params stored
    await s.worker.pollTick();
    const req = getRequest(s.db, r.id);
    expect(req?.status).toBe("failed");
    expect(req?.error).toBe(req?.paramsError);
    expect(req?.error).toBeTruthy();
    expect(s.urls).toEqual([]);
  });

  it("unknown job names are failed, never done", async () => {
    const s = setup(createFixtureFetch());
    s.db.sqlite
      .prepare(
        "INSERT INTO sync_requests (job, source, requested_at, status) VALUES ('bogus','api',?,'pending')",
      )
      .run(s.clock.now().toISOString());
    await s.worker.pollTick();
    const row = s.db.sqlite.prepare("SELECT status, error FROM sync_requests").get() as {
      status: string;
      error: string;
    };
    expect(row.status).toBe("failed");
    expect(row.error).toBe("unknown job");
    expect(s.urls).toEqual([]);
  });

  it("'all' never includes onboarding jobs", () => {
    const reg = createJobRegistry(createSleeperJobs({}));
    expect(ALL_ORDER).not.toContain("user");
    expect(ALL_ORDER).not.toContain("user_leagues");
    expect(reg.allInOrder()).not.toContain("user" as never);
    expect(reg.names()).not.toContain("user" as never);
  });
});

describe("active league", () => {
  function ctxFor(
    env: Record<string, string>,
    lines: string[],
  ): { ctx: JobContext; db: ReturnType<typeof tempDb> } {
    const dir = tempDataDir();
    const db = tempDb(dir);
    const logger = pino({ level: "info" }, { write: (l: string) => void lines.push(l) });
    return {
      db,
      ctx: {
        db,
        limiter: fast(),
        counter: createCallCounter(),
        now: () => new Date("2026-10-01T12:00:00Z"),
        logger,
        config: testConfig(dir, env),
        signal: new AbortController().signal,
      },
    };
  }

  it("DB active league beats DEFAULT_LEAGUE_ID; env is the fallback", () => {
    const { ctx, db } = ctxFor({ DEFAULT_LEAGUE_ID: "env-league" }, []);
    expect(requireLeagueId(ctx)).toBe("env-league");
    setActiveLeagueId(db, "db-league");
    expect(getActiveLeagueId(db)).toBe("db-league");
    expect(requireLeagueId(ctx)).toBe("db-league");
  });

  it("logs the skip reason once per run when no league is set", () => {
    const lines: string[] = [];
    const { ctx } = ctxFor({}, lines);
    expect(requireLeagueId(ctx)).toBeNull();
    expect(requireLeagueId(ctx)).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no league selected: finish onboarding or set DEFAULT_LEAGUE_ID");
  });
});

describe("fixture mode", () => {
  it("is refused under NODE_ENV=production", () => {
    expect(() =>
      assertFixtureModeAllowed({ SIDELINE_FIXTURE_FETCH: "1", NODE_ENV: "production" }),
    ).toThrow(/production/);
    expect(() =>
      fixtureFetchFromEnv({ SIDELINE_FIXTURE_FETCH: "1", NODE_ENV: "production" }),
    ).toThrow();
    expect(fixtureFetchFromEnv({ NODE_ENV: "production" })).toBeNull();
    expect(fixtureFetchFromEnv({ SIDELINE_FIXTURE_FETCH: "1", NODE_ENV: "test" })).toBeTypeOf(
      "function",
    );
  });

  it("serves the fixture user and leagues, case-insensitively", async () => {
    const f = createFixtureFetch();
    for (const name of ["manager_04", "Manager_04", "MANAGER_04"]) {
      const r = await f(`https://api.sleeper.app/v1/user/${name}`);
      expect(((await r.json()) as { user_id: string }).user_id).toBe(FIXTURE_USER_ID);
    }
    const l = await f(`https://api.sleeper.app/v1/user/${FIXTURE_USER_ID}/leagues/nfl/${SEASON}`);
    const body = (await l.json()) as { league_id: string }[];
    expect(body.map((x) => x.league_id)).toContain(FIXTURE_LEAGUE_ID);
  });
});
