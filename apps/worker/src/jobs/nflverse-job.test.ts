import { RateLimiter, createCallCounter } from "@sideline/sleeper";
import type { NflverseProvider } from "@sideline/providers";
import type { ScheduleGame } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "../fixture-fetch.js";
import { createJobRegistry } from "../registry.js";
import { runJobs } from "../runner.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "../testutil.js";
import type { Job, JobContext } from "../types.js";
import { applyKickoffFallback, nflverseJob } from "./nflverse-job.js";

function setup(env: Record<string, string> = {}) {
  const dir = tempDataDir();
  const db = tempDb(dir);
  const clock = fakeClock("2026-10-02T12:00:00Z");
  const ctx: JobContext = {
    db,
    limiter: new RateLimiter(),
    counter: createCallCounter(),
    now: clock.now,
    logger: silent,
    config: testConfig(dir, env),
    signal: new AbortController().signal,
  };
  return { dir, db, ctx, clock };
}

function game(id: string, over: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    season: 2026,
    week: 5,
    gameId: id,
    gameType: "REG",
    home: "KC",
    away: "SF",
    kickoffUtc: null,
    kickoffApproximate: true,
    roof: null,
    spreadLine: null,
    totalLine: null,
    homeScore: null,
    awayScore: null,
    ...over,
  };
}

const count = (db: ReturnType<typeof tempDb>, where = "1=1"): number =>
  (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM schedule WHERE ${where}`).get() as { n: number }).n;

describe("T1.5c nflverse job", () => {
  it("success: upserts 272 games with Z-format kickoffs; a second run changes nothing", async () => {
    const s = setup();
    const job = nflverseJob({ fetch: createFixtureFetch() });
    const first = await job.run(s.ctx);
    expect(first.rowsChanged).toBe(272);
    expect(first.status).toBeUndefined();
    expect(count(s.db)).toBe(272);
    const bad = s.db.sqlite
      .prepare("SELECT kickoff_utc AS k FROM schedule WHERE kickoff_utc IS NOT NULL")
      .all() as { k: string }[];
    expect(bad.length).toBeGreaterThan(200);
    for (const r of bad) expect(r.k).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await job.run(s.ctx)).rowsChanged).toBe(0);
  });

  it("flag off: degraded (skipped with a degraded note), no fetch, no rows", async () => {
    const s = setup({ ENABLE_NFLVERSE: "false" });
    const urls: string[] = [];
    const job = nflverseJob({ fetch: createFixtureFetch(undefined, (u) => urls.push(u)) });
    const res = await job.run(s.ctx);
    expect(res).toMatchObject({ rowsChanged: 0, status: "skipped" });
    expect(res.note).toMatch(/^degraded: .*ENABLE_NFLVERSE/);
    expect(urls).toEqual([]);
    expect(count(s.db)).toBe(0);
  });

  it("download failure: degraded, not thrown", async () => {
    const s = setup();
    const job = nflverseJob({ fetch: () => Promise.reject(new Error("offline")) });
    const res = await job.run(s.ctx);
    expect(res).toMatchObject({ rowsChanged: 0, status: "skipped" });
    expect(res.note).toMatch(/^degraded: network/);
  });

  it("a provider that throws is degraded, not a crash", async () => {
    const s = setup();
    const job = nflverseJob({
      provider: () =>
        ({
          getScheduleWithDates: () => Promise.reject(new Error("kaput")),
        }) as unknown as NflverseProvider,
    });
    const res = await job.run(s.ctx);
    expect(res.note).toBe("degraded: kaput");
  });

  it("failure does not stop other jobs, and the outcome is not failed", async () => {
    const s = setup({ ENABLE_NFLVERSE: "false" });
    const other: Job = { name: "projections", run: () => Promise.resolve({ rowsChanged: 4 }) };
    const registry = createJobRegistry([nflverseJob(), other]);
    const out = await runJobs(
      {
        db: s.db,
        limiter: s.ctx.limiter,
        logger: silent,
        config: s.ctx.config,
        now: s.clock.now,
        signal: () => s.ctx.signal,
      },
      registry,
      registry.allInOrder(),
    );
    expect(out.map((o) => [o.job, o.status])).toEqual([
      ["nflverse", "skipped"],
      ["projections", "success"],
    ]);
  });

  it("applies the fallback to untimed games and keeps timed ones", () => {
    const timed = game("a", { kickoffUtc: "2026-10-04T17:00:00.000Z", kickoffApproximate: false });
    const untimedSun = game("b");
    const noDate = game("c");
    const out = applyKickoffFallback(
      [timed, untimedSun, noDate],
      new Map([
        ["a", "2026-10-04"],
        ["b", "2026-11-08"],
      ]),
    );
    expect(out[0]).toEqual(timed);
    expect(out[1]).toMatchObject({
      kickoffUtc: "2026-11-08T18:00:00.000Z",
      kickoffApproximate: true,
    });
    expect(out[2]).toEqual(noDate);
  });

  it("stores fallback kickoffs for games the provider could not time", async () => {
    const s = setup();
    const job = nflverseJob({
      provider: () =>
        ({
          getScheduleWithDates: () =>
            Promise.resolve({
              ok: true,
              data: {
                games: [game("g1"), game("g2")],
                gamedays: new Map([
                  ["g1", "2026-10-15"],
                  ["g2", "2026-10-18"],
                ]),
              },
              meta: {
                source: "t",
                assetUpdatedAt: null,
                fetchedAt: "",
                fromCache: false,
                warnings: [],
              },
            }),
        }) as unknown as NflverseProvider,
    });
    await job.run(s.ctx);
    const rows = s.db.sqlite
      .prepare(
        "SELECT game_id AS id, kickoff_utc AS k, kickoff_approximate AS a FROM schedule ORDER BY game_id",
      )
      .all();
    expect(rows).toEqual([
      { id: "g1", k: "2026-10-16T00:00:00.000Z", a: 1 },
      { id: "g2", k: "2026-10-18T17:00:00.000Z", a: 1 },
    ]);
  });
});
