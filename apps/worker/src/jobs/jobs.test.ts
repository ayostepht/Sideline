import { readFileSync } from "node:fs";
import { upsertSchedule, type DbHandle } from "@sideline/db";
import type { NflverseProvider } from "@sideline/providers";
import { SYNC_JOB_NAMES, type ScheduleGame, type SyncJobName } from "@sideline/shared";
import { createCallCounter, RateLimiter } from "@sideline/sleeper";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { fakeClock, silent, tempDb, testConfig, tempDataDir } from "../testutil.js";
import type { Job, JobContext } from "../types.js";
import { BACKFILL_SEASON, POSITION_DROP_THRESHOLD, statsWeeksToFetch } from "./data-jobs.js";
import { createSleeperJobs, registeredJobs } from "./index.js";
import { SIDELINE_VERSION, STATE_MAX_AGE_MS } from "./common.js";
import { matchupWeeksToFetch } from "./league-jobs.js";
import type { NflverseJobDeps } from "./nflverse-job.js";

const LEAGUE = "9000000000000000001";

type Handler = (url: URL) => unknown;

interface Harness {
  jobs: Map<SyncJobName, Job>;
  calls: string[];
  headers: Headers[];
  routes: Map<string, Handler>;
  db: DbHandle;
  clock: ReturnType<typeof fakeClock>;
  ctx(overrides?: Partial<JobContext>): JobContext;
  run(
    name: SyncJobName,
    overrides?: Partial<JobContext>,
  ): Promise<{ rowsChanged: number; status?: string; note?: string; calls: number }>;
  set(prefix: string, h: Handler): void;
}

function stateBody(week = 5, type = "regular"): unknown {
  return {
    season: "2026",
    week,
    season_type: type,
    previous_season: "2025",
    season_start_date: "2026-09-09",
  };
}

function leagueBody(): unknown {
  return {
    league_id: LEAGUE,
    name: "Test League",
    status: "in_season",
    season: "2026",
    previous_league_id: "0",
    total_rosters: 2,
    scoring_settings: { rec: 1 },
    roster_positions: ["QB", "BN"],
    settings: { playoff_week_start: 8, waiver_type: 2, waiver_budget: 100 },
  };
}

function statRow(id: string, team: string, position = "QB", proj = true): unknown {
  return {
    player_id: id,
    team,
    opponent: "SF",
    stats: proj ? { gp: 1, pts_ppr: 12.5 } : { pts_ppr: 9 },
    player: { position, team },
  };
}

/** A minimal, valid ScheduleGame for the BACKFILL_SEASON stub nflverse provider below. */
function scheduleGame(id: string, season = BACKFILL_SEASON): ScheduleGame {
  return {
    season,
    week: 1,
    gameId: id,
    gameType: "REG",
    home: "AAA",
    away: "BBB",
    kickoffUtc: "2025-09-07T17:00:00.000Z",
    kickoffApproximate: false,
    roof: null,
    spreadLine: null,
    totalLine: null,
    homeScore: null,
    awayScore: null,
  };
}

/**
 * A no-network nflverse provider stub for `backfill_2025` tests (G3-FIX-2). Resolves successfully
 * with `games` filtered to the requested season; never touches the network or filesystem.
 */
function stubScheduleProvider(games: readonly ScheduleGame[]): NflverseProvider {
  return {
    getScheduleWithDates: (season: number) =>
      Promise.resolve({
        ok: true,
        data: { games: games.filter((g) => g.season === season), gamedays: new Map() },
        meta: {
          source: "test",
          assetUpdatedAt: null,
          fetchedAt: "",
          fromCache: false,
          warnings: [],
        },
      }),
  } as unknown as NflverseProvider;
}

/** Default backfill schedule stub: two 2025 games, so "already present" becomes true after one run. */
function defaultNflverseDeps(): NflverseJobDeps {
  return { provider: () => stubScheduleProvider([scheduleGame("g1"), scheduleGame("g2")]) };
}

function playersBody(qbs: number): unknown {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < qbs; i++) {
    out[`q${i}`] = {
      player_id: `q${i}`,
      first_name: "Q",
      last_name: `B${i}`,
      position: "QB",
      team: "ATL",
    };
  }
  out["r1"] = { player_id: "r1", first_name: "R", last_name: "B", position: "RB", team: "ATL" };
  return out;
}

function harness(
  config: Record<string, string> = { DEFAULT_LEAGUE_ID: LEAGUE },
  nflverseDeps: NflverseJobDeps = defaultNflverseDeps(),
): Harness {
  const dir = tempDataDir();
  const db = tempDb(dir);
  const clock = fakeClock("2026-10-01T12:00:00Z");
  const calls: string[] = [];
  const headers: Headers[] = [];
  const routes = new Map<string, Handler>();
  const base = (u: string): URL => new URL(u);
  routes.set("/v1/state/nfl", () => stateBody());
  routes.set(`/v1/league/${LEAGUE}/users`, () => [
    { user_id: "u1", display_name: "Coach One", metadata: { team_name: "Team One" } },
  ]);
  routes.set(`/v1/league/${LEAGUE}/rosters`, () => [
    {
      roster_id: 1,
      owner_id: "u1",
      players: ["q0"],
      starters: ["q0"],
      settings: { wins: 1, fpts: 100, fpts_decimal: 5 },
    },
  ]);
  routes.set(`/v1/league/${LEAGUE}/matchups/`, () => [
    {
      roster_id: 1,
      matchup_id: 1,
      points: 10,
      starters: ["q0"],
      starters_points: [10],
      players: ["q0"],
      players_points: { q0: 10 },
    },
  ]);
  routes.set(`/v1/league/${LEAGUE}/transactions/`, () => []);
  routes.set(`/v1/league/${LEAGUE}`, () => leagueBody());
  routes.set("/v1/players/nfl/trending/", () => [{ player_id: "q0", count: 7 }]);
  routes.set("/v1/players/nfl", () => playersBody(3));
  routes.set("/stats/nfl/", () => [statRow("q0", "ATL", "QB", false)]);
  routes.set("/projections/nfl/", () => [
    statRow("q0", "LAR"),
    { player_id: "x", stats: { adp_dd_ppr: 4 }, opponent: null, player: { position: "QB" } },
  ]);
  const fetchImpl: typeof fetch = (input, init) => {
    const url = base(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    calls.push(url.pathname + url.search);
    headers.push(new Headers(init?.headers));
    let handler: Handler | undefined;
    let best = -1;
    for (const [prefix, h] of routes) {
      if (url.pathname.startsWith(prefix) && prefix.length > best) {
        best = prefix.length;
        handler = h;
      }
    }
    if (!handler) return Promise.resolve(new Response("{}", { status: 404 }));
    return Promise.resolve(
      new Response(JSON.stringify(handler(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const jobs = new Map(
    createSleeperJobs({ fetch: fetchImpl }, nflverseDeps).map((j) => [j.name, j]),
  );
  const limiter = new RateLimiter({ ratePerSecond: 10_000, maxPerWindow: 1_000_000 });
  const cfg = testConfig(dir, config);
  const ctx = (o: Partial<JobContext> = {}): JobContext => ({
    db,
    limiter,
    counter: createCallCounter(),
    now: clock.now,
    logger: silent,
    config: cfg,
    signal: new AbortController().signal,
    ...o,
  });
  return {
    jobs,
    calls,
    headers,
    routes,
    db,
    clock,
    ctx,
    set: (p, h) => routes.set(p, h),
    async run(name, o) {
      const job = jobs.get(name);
      if (!job) throw new Error(`no job ${name}`);
      const c = ctx(o);
      const res = await job.run(c);
      return { ...res, calls: c.counter.calls };
    },
  };
}

describe("T1.5b registration", () => {
  it("registers every Sleeper job exactly once", () => {
    const names = registeredJobs.map((j) => j.name).sort();
    const expected = [...SYNC_JOB_NAMES].sort();
    expect(names).toEqual(expected);
  });
});

describe("T1.5b idempotency and call accounting", () => {
  it("every job reports 0 changed rows on an identical second run", async () => {
    const h = harness();
    const order: SyncJobName[] = [
      "state",
      "league",
      "users",
      "rosters",
      "matchups",
      "transactions",
      "trending",
      "stats",
      "projections",
      "players",
    ];
    for (const name of order) {
      const first = await h.run(name);
      expect(first.calls, name).toBeGreaterThan(0);
      if (name !== "transactions") expect(first.rowsChanged, `${name} first`).toBeGreaterThan(0);
      h.clock.advance(25 * 3_600_000);
      const second = await h.run(name);
      expect(second.rowsChanged, `${name} second`).toBe(0);
    }
  });

  it("sends the Sideline user agent on every call", async () => {
    const h = harness();
    await h.run("state");
    await h.run("trending");
    expect(h.headers.length).toBe(3);
    for (const hd of h.headers)
      expect(hd.get("user-agent")).toMatch(/^Sideline\/\S+ \(self-hosted\)$/);
  });

  it("league-scoped jobs skip without a configured league and make no calls", async () => {
    const h = harness({});
    for (const name of ["league", "users", "rosters", "matchups", "transactions"] as const) {
      const r = await h.run(name);
      expect(r.status).toBe("skipped");
    }
    expect(h.calls).toEqual([]);
  });

  it("state, stats and projections skip outside the regular season and preseason", async () => {
    const h = harness();
    h.set("/v1/state/nfl", () => stateBody(0, "off"));
    await h.run("state");
    h.calls.length = 0;
    expect((await h.run("stats")).status).toBe("skipped");
    expect((await h.run("projections")).status).toBe("skipped");
    expect(h.calls).toEqual([]);
  });

  it("loads state itself when the state job has not run", async () => {
    const h = harness();
    await h.run("matchups");
    expect(h.calls[0]).toBe("/v1/state/nfl");
  });
});

describe("T1.5b players", () => {
  it("skips the network within 20h of the last fetch, runs after 23h50m (cron jitter), no ETag", async () => {
    const h = harness();
    const first = await h.run("players");
    expect(first.calls).toBe(1);
    expect(h.headers[0]?.get("if-none-match")).toBeNull();
    // A stored ESPN id keeps the guard in force (no ids at all would bypass it).
    h.db.sqlite.prepare("UPDATE players SET espn_id = '123' WHERE player_id = 'r1'").run();
    h.calls.length = 0;
    h.clock.advance(2 * 3_600_000);
    const skipped = await h.run("players");
    expect(skipped).toMatchObject({ status: "skipped", rowsChanged: 0, calls: 0 });
    expect(h.calls).toEqual([]);
    h.clock.advance(21 * 3_600_000 + 50 * 60_000); // 23h50m since the first fetch
    const again = await h.run("players");
    expect(again.calls).toBe(1);
    expect(h.calls).toEqual(["/v1/players/nfl"]);
    expect(h.headers.at(-1)?.get("if-none-match")).toBeNull();
  });

  it("bypasses the 20h guard with zero ESPN ids only when the last fetch is 6h+ old, never in a loop", async () => {
    const h = harness();
    await h.run("players");
    h.calls.length = 0;
    h.clock.advance(2 * 3_600_000);
    expect(await h.run("players")).toMatchObject({ status: "skipped", calls: 0 });
    expect(h.calls).toEqual([]);
    h.clock.advance(5 * 3_600_000); // 7h since the fetch
    const bypass = await h.run("players");
    expect(bypass.calls).toBe(1);
    expect(h.calls).toEqual(["/v1/players/nfl"]);
    // Immediately again: the fetch just refreshed the marker, so exactly one fetch total.
    h.calls.length = 0;
    expect(await h.run("players")).toMatchObject({ status: "skipped", calls: 0 });
    expect(h.calls).toEqual([]);
    h.db.sqlite.prepare("UPDATE players SET espn_id = '123' WHERE player_id = 'r1'").run();
    h.clock.advance(7 * 3_600_000);
    expect(await h.run("players")).toMatchObject({ status: "skipped", calls: 0 });
  });

  it("warns when a fantasy position drops past the threshold and not below it", async () => {
    expect(POSITION_DROP_THRESHOLD).toBe(0.1);
    const lines: { msg: string; position?: string }[] = [];
    const logger = pino(
      { level: "warn" },
      { write: (s: string) => lines.push(JSON.parse(s) as never) },
    );
    const h = harness();
    h.set("/v1/players/nfl", () => playersBody(20));
    await h.run("players", { logger });
    expect(lines).toEqual([]);

    h.clock.advance(25 * 3_600_000);
    h.set("/v1/players/nfl", () => playersBody(18)); // 10% drop: not above threshold
    await h.run("players", { logger });
    expect(lines).toEqual([]);

    h.clock.advance(25 * 3_600_000);
    h.set("/v1/players/nfl", () => playersBody(15)); // 25% below the stored 20
    await h.run("players", { logger });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ position: "QB", stored: 20, incoming: 15 });
  });
});

describe("T1.5b matchups", () => {
  it("plans current, previous, missing completed and future weeks up to playoff start - 1", () => {
    expect(matchupWeeksToFetch(5, 8, new Set())).toEqual([5, 4, 1, 2, 3, 6, 7]);
    expect(matchupWeeksToFetch(5, 8, new Set([1, 2, 3, 4, 6, 7]))).toEqual([5, 4]);
    expect(matchupWeeksToFetch(1, null, new Set())).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(matchupWeeksToFetch(18, 15, new Set())).toEqual([
      18, 17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("fetches exactly those weeks, then only current and previous on the next run", async () => {
    const h = harness();
    await h.run("league");
    await h.run("state");
    h.calls.length = 0;
    const first = await h.run("matchups");
    const weeks = h.calls.map((c) => Number(c.split("/").pop()));
    expect(weeks).toEqual([5, 4, 1, 2, 3, 6, 7]);
    expect(first.calls).toBe(7);
    h.calls.length = 0;
    const second = await h.run("matchups");
    expect(h.calls.map((c) => Number(c.split("/").pop()))).toEqual([5, 4]);
    expect(second.rowsChanged).toBe(0);
  });
});

describe("T1.5b abort on lease loss", () => {
  it("makes no fetch after the signal aborts mid-job", async () => {
    const h = harness();
    await h.run("league");
    await h.run("state");
    h.calls.length = 0;
    const ac = new AbortController();
    h.set(`/v1/league/${LEAGUE}/matchups/`, () => {
      if (h.calls.length === 2) ac.abort(new Error("sync lease lost"));
      return [];
    });
    await expect(h.run("matchups", { signal: ac.signal })).rejects.toThrow("sync lease lost");
    expect(h.calls).toHaveLength(2);
    // The job has already rejected, so nothing is left running that could fetch again.
    expect(h.calls).toHaveLength(2);
  });

  it("makes no fetch at all when already aborted", async () => {
    const h = harness();
    const ac = new AbortController();
    ac.abort(new Error("shutdown"));
    for (const name of ["state", "players", "trending", "projections"] as const) {
      await expect(h.run(name, { signal: ac.signal })).rejects.toThrow("shutdown");
    }
    expect(h.calls).toEqual([]);
  });
});

describe("T1.5b stats and projections", () => {
  it("writes pregame snapshots only when the schedule kickoff is after the fetch", async () => {
    const h = harness();
    await h.run("state");
    upsertSchedule(h.db, [
      {
        season: 2026,
        week: 5,
        gameId: "g5",
        gameType: "REG",
        home: "LA",
        away: "SF",
        kickoffUtc: "2026-10-04T17:00:00Z",
        kickoffApproximate: false,
        roof: null,
        spreadLine: null,
        totalLine: null,
        homeScore: null,
        awayScore: null,
      },
    ]);
    const res = await h.run("projections");
    expect(res.calls).toBe(2);
    const count = (t: string): number =>
      (h.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect(count("player_week_projections")).toBe(2); // weeks 5 and 6, placeholder rows dropped
    // week 5 has a kickoff (LAR maps to LA); week 6 has no schedule row, so it is skipped
    expect(count("player_week_projection_snapshots")).toBe(1);
    expect(res.rowsChanged).toBe(3);
  });

  it("degrades to a note when the endpoint returns no real rows", async () => {
    const h = harness();
    h.set("/projections/nfl/", () => [
      { player_id: "x", stats: { adp_dd_ppr: 4 }, opponent: null },
    ]);
    const r = await h.run("projections");
    expect(r.rowsChanged).toBe(0);
  });
});

describe("G3-FIX-1 statsWeeksToFetch", () => {
  it("backfills every earlier week not yet stored, plus current and previous", () => {
    expect(statsWeeksToFetch(4, new Set([3, 4]))).toEqual([4, 3, 1, 2]);
  });

  it("fetches only current and previous once every earlier week is already stored", () => {
    expect(statsWeeksToFetch(4, new Set([1, 2, 3]))).toEqual([4, 3]);
  });

  it("never looks forward past the current week", () => {
    const weeks = statsWeeksToFetch(4, new Set());
    expect(weeks).toEqual([4, 3, 1, 2]);
    expect(weeks.every((w) => w <= 4)).toBe(true);
  });

  it("week 1 has no earlier weeks to backfill", () => {
    expect(statsWeeksToFetch(1, new Set())).toEqual([1]);
  });
});

describe("G3-FIX-1 statsJob self-heals a gap", () => {
  const weekOf = (c: string): number | null => {
    const m = /^\/stats\/nfl\/2026\/(\d+)\?/.exec(c);
    return m ? Number(m[1]) : null;
  };

  it("fetches every week 1..current on a cold start, not just current and previous", async () => {
    const h = harness();
    await h.run("state"); // stateBody() defaults to week 5, 2026 regular season
    const r = await h.run("stats");
    const fetched = h.calls.map(weekOf).filter((w): w is number => w !== null);
    expect(fetched.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(r.calls).toBe(5);
    const stored = (
      h.db.sqlite.prepare("SELECT DISTINCT week FROM player_week_stats ORDER BY week").all() as {
        week: number;
      }[]
    ).map((row) => row.week);
    expect(stored).toEqual([1, 2, 3, 4, 5]);
  });

  it("refetches a week deleted from storage (the reported bug) without repeating completed weeks", async () => {
    const h = harness();
    await h.run("state");
    await h.run("stats"); // weeks 1-5 now stored
    // Reproduces the live incident: a DB reset left only weeks 3-4 synced, weeks 1-2 missing.
    h.db.sqlite.prepare("DELETE FROM player_week_stats WHERE week IN (1, 2)").run();
    h.calls.length = 0;
    await h.run("stats");
    const fetched = h.calls.map(weekOf).filter((w): w is number => w !== null);
    expect(fetched).toContain(1);
    expect(fetched).toContain(2);
    expect(fetched.sort((a, b) => a - b)).toEqual([1, 2, 4, 5]); // 3 already stored, skipped
  });
});

describe("T1.5b backfill_2025", () => {
  it("fetches 36 calls from empty, then zero calls when data is present", async () => {
    const h = harness();
    const first = await h.run("backfill_2025");
    expect(first.calls).toBe(36);
    expect(h.calls.every((c) => c.includes(`/nfl/${BACKFILL_SEASON}/`))).toBe(true);
    h.calls.length = 0;
    const second = await h.run("backfill_2025");
    expect(second).toMatchObject({ status: "skipped", rowsChanged: 0, calls: 0 });
    expect(h.calls).toEqual([]);
  });

  it("fetches only the missing weeks of a partial backfill", async () => {
    const h = harness();
    await h.run("backfill_2025");
    h.db.sqlite.prepare("DELETE FROM player_week_stats WHERE week IN (3, 4)").run();
    h.calls.length = 0;
    const r = await h.run("backfill_2025");
    expect(r.calls).toBe(2);
    expect(h.calls.every((c) => c.startsWith("/stats/nfl/2025/"))).toBe(true);
  });
});

const scheduleRowCount = (h: Harness, season = BACKFILL_SEASON): number =>
  (
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM schedule WHERE season = ?").get(season) as {
      n: number;
    }
  ).n;

describe("G3-FIX-2 backfill_2025 also backfills the 2025 nflverse schedule", () => {
  it("calls getScheduleWithDates(2025) once and upserts the resulting games", async () => {
    const seasonsRequested: number[] = [];
    const base = stubScheduleProvider([scheduleGame("g1"), scheduleGame("g2")]);
    const provider: NflverseProvider = {
      getScheduleWithDates: (season: number) => {
        seasonsRequested.push(season);
        return base.getScheduleWithDates(season);
      },
    } as unknown as NflverseProvider;
    const h = harness(undefined, { provider: () => provider });
    const res = await h.run("backfill_2025");
    expect(seasonsRequested).toEqual([BACKFILL_SEASON]);
    expect(scheduleRowCount(h)).toBe(2);
    expect(res.note).toMatch(/schedule: 2 games/);
  });

  it("does not refetch the schedule on a second run, while stats/projections are still rechecked independently", async () => {
    const seasonsRequested: number[] = [];
    const base = stubScheduleProvider([scheduleGame("g1"), scheduleGame("g2")]);
    const provider: NflverseProvider = {
      getScheduleWithDates: (season: number) => {
        seasonsRequested.push(season);
        return base.getScheduleWithDates(season);
      },
    } as unknown as NflverseProvider;
    const h = harness(undefined, { provider: () => provider });
    const first = await h.run("backfill_2025");
    expect(first.calls).toBe(36);
    expect(seasonsRequested).toEqual([BACKFILL_SEASON]);

    // A stats week goes missing (reset, downtime, etc.): stats must still be refetched...
    h.db.sqlite.prepare("DELETE FROM player_week_stats WHERE week = 3").run();
    h.calls.length = 0;
    const second = await h.run("backfill_2025");
    expect(second.calls).toBe(1);
    // ...but the schedule, already stored, must not be fetched again.
    expect(seasonsRequested).toEqual([BACKFILL_SEASON]);
    expect(scheduleRowCount(h)).toBe(2);
  });

  it("degrades the schedule portion (no throw) when ENABLE_NFLVERSE is off, without blocking stats/projections", async () => {
    const provider: NflverseProvider = {
      getScheduleWithDates: () => {
        throw new Error("must not be called when nflverse is disabled");
      },
    } as unknown as NflverseProvider;
    const h = harness(
      { DEFAULT_LEAGUE_ID: LEAGUE, ENABLE_NFLVERSE: "false" },
      { provider: () => provider },
    );
    const res = await h.run("backfill_2025");
    expect(res.calls).toBe(36); // stats + projections still ran
    expect(res.note).toMatch(/schedule: degraded:.*ENABLE_NFLVERSE/);
    expect(scheduleRowCount(h)).toBe(0);
  });
});

const stateCalls = (h: Harness): number =>
  h.calls.filter((c) => c.startsWith("/v1/state/nfl")).length;

describe("T1.5c review m1: stored nfl_state goes stale after 1 hour", () => {
  it("reuses a fresh state and refetches a stale one, then stays fresh", async () => {
    const h = harness();
    await h.run("state");
    h.calls.length = 0;
    h.clock.advance(STATE_MAX_AGE_MS - 60_000);
    await h.run("stats");
    expect(stateCalls(h)).toBe(0);
    h.clock.advance(2 * 60_000);
    await h.run("stats");
    expect(stateCalls(h)).toBe(1);
    h.clock.advance(60_000);
    await h.run("stats");
    expect(stateCalls(h)).toBe(1); // identical state still stamps fetched_at
  });
});

describe("T1.5c review m2: a backfill week is written atomically", () => {
  it("a failure mid-week leaves no rows for that week and the next run refetches it", async () => {
    const h = harness();
    const rows = Array.from({ length: 600 }, (_, i) =>
      statRow(i === 599 ? "boom" : `p${i}`, "ATL", "QB", false),
    );
    h.set("/stats/nfl/", () => rows);
    h.db.sqlite.exec(
      `CREATE TRIGGER fail_boom BEFORE INSERT ON player_week_stats WHEN NEW.player_id = 'boom'
       BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
    );
    await expect(h.run("backfill_2025")).rejects.toThrow("injected failure");
    const n = (): number =>
      (h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM player_week_stats").get() as { n: number }).n;
    expect(n()).toBe(0); // the first 500-row chunk was rolled back with the rest of the week
    h.db.sqlite.exec("DROP TRIGGER fail_boom");
    h.calls.length = 0;
    await h.run("backfill_2025");
    expect(h.calls[0]).toMatch(/^\/stats\/nfl\/2025\/1\?/);
    expect(n()).toBeGreaterThanOrEqual(600);
  });
});

describe("T1.5c review m3: players and the fetched-at marker share a transaction", () => {
  it("a failed marker write rolls the players back, so the next run refetches", async () => {
    const h = harness();
    h.db.sqlite.exec(
      `CREATE TRIGGER fail_marker BEFORE INSERT ON app_settings WHEN NEW.key = 'players_fetched_at'
       BEGIN SELECT RAISE(ABORT, 'marker failed'); END`,
    );
    await expect(h.run("players")).rejects.toThrow("marker failed");
    const n = (): number =>
      (h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM players").get() as { n: number }).n;
    expect(n()).toBe(0);
    h.db.sqlite.exec("DROP TRIGGER fail_marker");
    const again = await h.run("players");
    expect(again.status).toBeUndefined();
    expect(n()).toBe(4);
  });
});

describe("T1.5c review n1: User-Agent version", () => {
  it("SIDELINE_VERSION matches apps/worker/package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SIDELINE_VERSION).toBe(pkg.version);
  });
});
