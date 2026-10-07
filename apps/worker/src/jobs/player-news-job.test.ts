import { upsertPlayerNews, upsertPlayers, type DbHandle } from "@sideline/db";
import { createMinIntervalLimiter } from "@sideline/providers";
import type { Player } from "@sideline/shared";
import { createCallCounter, RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "../fixture-fetch.js";
import { createJobRegistry } from "../registry.js";
import { runJobs } from "../runner.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "../testutil.js";
import type { Job, JobContext } from "../types.js";
import { playerNewsJob } from "./player-news-job.js";

const LEAGUE = "9000000000000000001";
const NOW = "2026-10-07T12:00:00Z";

function player(id: string, espnId: string | null): Player {
  return {
    playerId: id,
    fullName: `Player ${id}`,
    firstName: null,
    lastName: null,
    position: "WR",
    fantasyPositions: ["WR"],
    team: "KC",
    status: null,
    injuryStatus: null,
    injuryBodyPart: null,
    active: true,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    espnId,
  };
}

function setup(rostered: string[], players: Player[]) {
  const dir = tempDataDir();
  const db: DbHandle = tempDb(dir);
  const clock = fakeClock(NOW);
  upsertPlayers(db, players, NOW);
  db.sqlite
    .prepare(
      `INSERT INTO rosters (league_id, roster_id, players_json, starters_json, reserve_json, taxi_json, synced_at)
       VALUES (?, 1, ?, '[]', '[]', '[]', ?)`,
    )
    .run(LEAGUE, JSON.stringify(rostered), NOW);
  const ctx = (over: Partial<JobContext> = {}): JobContext => ({
    db,
    limiter: new RateLimiter(),
    counter: createCallCounter(),
    now: clock.now,
    logger: silent,
    config: testConfig(dir, { DEFAULT_LEAGUE_ID: LEAGUE }),
    signal: new AbortController().signal,
    ...over,
  });
  return { db, ctx };
}

const noWait = createMinIntervalLimiter(0);
const newsRows = (db: DbHandle) =>
  db.sqlite.prepare("SELECT id, player_id AS p FROM player_news ORDER BY id").all() as {
    id: string;
    p: string;
  }[];

function recording(inner = createFixtureFetch()) {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(u);
    return inner(input, init);
  };
  return { urls, fetch };
}

describe("P7.5 player news job", () => {
  it("maps recent-feed items to players, skips unmatched, and is idempotent", async () => {
    // 4430027 and 3040151 are athletes in the recent-feed fixture; 999 is not.
    const s = setup([], [player("p1", "4430027"), player("p2", "3040151"), player("p3", "999")]);
    const rec = recording();
    const job = playerNewsJob({ fetch: rec.fetch, limiter: noWait });
    const first = await job.run(s.ctx());
    const rows = newsRows(s.db);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.p))).toEqual(new Set(["p1", "p2"]));
    expect(rows.every((r) => r.id.startsWith("espn:") && r.id.endsWith(`:${r.p}`))).toBe(true);
    expect(first.rowsChanged).toBeGreaterThan(0);
    expect(rec.urls).toHaveLength(1);
    const second = await job.run(s.ctx());
    expect(second.rowsChanged).toBe(0);
  });

  it("fetches rostered players with an espn id, capped per run and rotating", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const s = setup(
      [...ids, "noespn"],
      [...ids.map((i, n) => player(i, String(100 + n))), player("noespn", null)],
    );
    const rec = recording();
    const job = playerNewsJob({ fetch: rec.fetch, limiter: noWait, cap: 2 });
    await job.run(s.ctx());
    const per = (u: string[]) =>
      u.filter((x) => x.includes("playerId=")).map((x) => /playerId=(\d+)/.exec(x)?.[1]);
    expect(per(rec.urls)).toEqual(["100", "101"]);
    rec.urls.length = 0;
    await job.run(s.ctx());
    expect(per(rec.urls)).toEqual(["102", "103"]);
    // Per-player items belong to the requested player.
    expect(new Set(newsRows(s.db).map((r) => r.p))).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("an ESPN failure does not throw, is skipped as degraded, and other jobs still run", async () => {
    const s = setup(["a"], [player("a", "100")]);
    const failing: typeof globalThis.fetch = () =>
      Promise.resolve(new Response("nope", { status: 500 }));
    let otherRan = false;
    const other: Job = {
      name: "state",
      run: () => {
        otherRan = true;
        return Promise.resolve({ rowsChanged: 0 });
      },
    };
    const registry = createJobRegistry([playerNewsJob({ fetch: failing, limiter: noWait }), other]);
    const out = await runJobs(
      {
        db: s.db,
        limiter: new RateLimiter(),
        logger: silent,
        config: s.ctx().config,
        now: () => new Date(NOW),
        signal: () => new AbortController().signal,
      },
      registry,
      ["player_news", "state"],
    );
    expect(out.map((o) => o.status)).toEqual(["skipped", "success"]);
    expect(otherRan).toBe(true);
    expect(newsRows(s.db)).toEqual([]);
  });

  it("targeted request fetches only that player", async () => {
    const s = setup(["a", "b"], [player("a", "100"), player("b", "101")]);
    const rec = recording();
    const job = playerNewsJob({ fetch: rec.fetch, limiter: noWait });
    const res = await job.run(s.ctx({ target: "b" }));
    expect(rec.urls).toHaveLength(1);
    expect(rec.urls[0]).toContain("playerId=101");
    expect(res.rowsChanged).toBeGreaterThan(0);
    expect(new Set(newsRows(s.db).map((r) => r.p))).toEqual(new Set(["b"]));
  });

  it("targeted request for a player without an espn id makes no call", async () => {
    const s = setup([], [player("a", null)]);
    const rec = recording();
    const res = await playerNewsJob({ fetch: rec.fetch, limiter: noWait }).run(
      s.ctx({ target: "a" }),
    );
    expect(rec.urls).toEqual([]);
    expect(res.status).toBe("skipped");
  });

  it("prunes news older than 30 days and does not store expired items", async () => {
    const s = setup([], [player("p1", "4430027")]);
    upsertPlayerNews(s.db, [
      {
        id: "espn:old:p1",
        playerId: "p1",
        headline: "old",
        summary: null,
        url: null,
        source: "ESPN",
        publishedAt: "2026-08-01T00:00:00.000Z",
        fetchedAt: NOW,
      },
    ]);
    await playerNewsJob({ fetch: createFixtureFetch(), limiter: noWait }).run(s.ctx());
    expect(newsRows(s.db).some((r) => r.id === "espn:old:p1")).toBe(false);
  });

  it("fixture mode serves ESPN from tests/fixtures/espn and never touches the network", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("network used"));
    try {
      const s = setup(["a"], [player("a", "3139477"), player("p1", "4430027")]);
      const res = await playerNewsJob({ fetch: createFixtureFetch(), limiter: noWait }).run(
        s.ctx(),
      );
      expect(res.status).toBeUndefined();
      expect(newsRows(s.db).length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = real;
    }
  });
});
