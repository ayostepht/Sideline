import {
  enqueue,
  getActiveLeagueId,
  getRequest,
  getSleeperUserId,
  getSleeperUsername,
  setActiveLeagueId,
  setSleeperUserId,
  setSleeperUsername,
} from "@sideline/db";
import { RateLimiter } from "@sideline/sleeper";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { runSyncCli, type CliDeps } from "./cli/sync.js";
import { createFixtureFetch } from "./fixture-fetch.js";
import { LeaseKeeper } from "./lease.js";
import { createJobRegistry } from "./registry.js";
import { fakeClock, tempDataDir, tempDb, testConfig } from "./testutil.js";
import type { Job } from "./types.js";
import { Worker } from "./worker.js";

// Sanitized fixture identity (tests/fixtures/sleeper/manifest.json).
const USERNAME = "manager_04";
const USER_ID = "100000000000000004";
const LEAGUE = "1000000000000000001";

const fast = (): RateLimiter => new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100000 });

function setup(opts: { env?: Record<string, string>; fetchImpl?: typeof fetch }) {
  const dir = tempDataDir();
  const db = tempDb(dir);
  const clock = fakeClock("2026-10-01T12:00:00Z");
  const urls: string[] = [];
  const base = opts.fetchImpl ?? createFixtureFetch();
  const counting: typeof fetch = (input, init) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return base(input, init);
  };
  const warnings: string[] = [];
  const logger = pino({ level: "warn" }, {
    write: (line: string) => warnings.push(line),
  } as unknown as NodeJS.WritableStream);
  const ran: string[] = [];
  const jobs: Job[] = [
    {
      name: "league",
      run: () => {
        ran.push("league");
        return Promise.resolve({ rowsChanged: 1 });
      },
    },
  ];
  const config = testConfig(dir, opts.env ?? {});
  const lease = new LeaseKeeper(db, "w1", clock.now);
  const registry = createJobRegistry(jobs);
  const worker = new Worker({
    db,
    config,
    registry,
    limiter: fast(),
    logger,
    lease,
    now: clock.now,
    sleeper: { fetch: counting },
    loadGames: () => [],
  });
  worker.acquireTick();
  const cliDeps = (): CliDeps => ({
    config,
    registry,
    limiter: fast(),
    logger,
    now: clock.now,
    sleep: () => Promise.resolve(),
    out: () => undefined,
    holder: "cli-1",
    sleeper: { fetch: counting },
  });
  return { dir, db, clock, worker, urls, warnings, ran, cliDeps };
}

const userUrls = (urls: string[]): string[] => urls.filter((u) => u.includes("/user/"));

describe("sleeper user id seeding (G2-B1)", () => {
  it("username in settings, id missing: one lookup, id stored, league jobs run", async () => {
    const s = setup({});
    setSleeperUsername(s.db, USERNAME);
    setActiveLeagueId(s.db, LEAGUE);
    const { id } = enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(getRequest(s.db, id)).toMatchObject({ status: "done", error: null });
    expect(userUrls(s.urls)).toEqual([`https://api.sleeper.app/v1/user/${USERNAME}`]);
    expect(getSleeperUserId(s.db)).toBe(USER_ID);
    expect(getSleeperUsername(s.db)).toBe(USERNAME);
    expect(getActiveLeagueId(s.db)).toBe(LEAGUE);
    expect(s.ran).toEqual(["league"]);
  });

  it("username only in env: same, and the stored username stays unset", async () => {
    const s = setup({ env: { SLEEPER_USERNAME: USERNAME } });
    setActiveLeagueId(s.db, LEAGUE);
    enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(userUrls(s.urls)).toEqual([`https://api.sleeper.app/v1/user/${USERNAME}`]);
    expect(getSleeperUserId(s.db)).toBe(USER_ID);
    expect(getSleeperUsername(s.db)).toBeNull();
    expect(getActiveLeagueId(s.db)).toBe(LEAGUE);
    expect(s.ran).toEqual(["league"]);
  });

  it("id already stored: zero user fetches", async () => {
    const s = setup({ env: { SLEEPER_USERNAME: USERNAME } });
    setSleeperUserId(s.db, "existing");
    enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(userUrls(s.urls)).toEqual([]);
    expect(getSleeperUserId(s.db)).toBe("existing");
    expect(s.ran).toEqual(["league"]);
  });

  it("no username anywhere: no fetch", async () => {
    const s = setup({});
    enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(s.urls).toEqual([]);
    expect(s.ran).toEqual(["league"]);
  });

  it("lookup failure: warning, league jobs still run, request not failed, no same-cycle retry", async () => {
    const s = setup({
      fetchImpl: () => Promise.resolve(new Response("null", { status: 200 })),
    });
    setSleeperUsername(s.db, "nobody");
    setActiveLeagueId(s.db, LEAGUE);
    const { id } = enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(getRequest(s.db, id)).toMatchObject({ status: "done", error: null });
    expect(userUrls(s.urls)).toHaveLength(1);
    expect(getSleeperUserId(s.db)).toBeNull();
    expect(getSleeperUsername(s.db)).toBe("nobody");
    expect(getActiveLeagueId(s.db)).toBe(LEAGUE);
    expect(s.warnings.join("\n")).toContain("could not resolve sleeper user id");
    expect(s.ran).toEqual(["league"]);
  });

  it("scheduled cycle also resolves the id", async () => {
    const s = setup({ env: { SLEEPER_USERNAME: USERNAME } });
    await s.worker.scheduleTick();
    expect(s.ran).toEqual(["league"]);
    expect(getSleeperUserId(s.db)).toBe(USER_ID);
  });

  it("CLI --once (all): resolves the id; a single job does not", async () => {
    const s = setup({ env: { SLEEPER_USERNAME: USERNAME } });
    // Release the worker's lease and let its heartbeat go stale so the CLI runs jobs itself.
    await s.worker.stop();
    s.clock.advance(60 * 60 * 1000);
    const code = await runSyncCli(["--once", "--job=league"], s.cliDeps());
    expect(code).toBe(0);
    expect(userUrls(s.urls)).toEqual([]);
    const code2 = await runSyncCli(["--once"], s.cliDeps());
    expect(code2).toBe(0);
    expect(userUrls(s.urls)).toHaveLength(1);
    expect(getSleeperUserId(s.db)).toBe(USER_ID);
  });
});
