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
      [
        ...ids.map((i, n) => player(i, n === 0 ? "3139477" : String(100 + n))),
        player("noespn", null),
      ],
    );
    const rec = recording();
    const job = playerNewsJob({ fetch: rec.fetch, limiter: noWait, cap: 2 });
    await job.run(s.ctx());
    const per = (u: string[]) =>
      u.filter((x) => x.includes("playerId=")).map((x) => /playerId=(\d+)/.exec(x)?.[1]);
    expect(per(rec.urls)).toEqual(["3139477", "101"]);
    rec.urls.length = 0;
    await job.run(s.ctx());
    expect(per(rec.urls)).toEqual(["102", "103"]);
    // The fixture feed is about athlete 3139477 (player "a"); other requests keep nothing.
    expect(new Set(newsRows(s.db).map((r) => r.p))).toEqual(new Set(["a"]));
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
    const s = setup(["a", "b"], [player("a", "100"), player("b", "3139477")]);
    const rec = recording();
    const job = playerNewsJob({ fetch: rec.fetch, limiter: noWait });
    const res = await job.run(s.ctx({ target: "b" }));
    expect(rec.urls).toHaveLength(1);
    expect(rec.urls[0]).toContain("playerId=3139477");
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

  describe("circuit breaker", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const sixPlayers = () => six.map((i, n) => player(i, String(100 + n)));
    const counting = (status: number | "hang") => {
      let calls = 0;
      const fetch: typeof globalThis.fetch = (_i, init) => {
        calls++;
        if (status === "hang") {
          return new Promise((_res, rej) => {
            init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
          });
        }
        return Promise.resolve(new Response("x", { status }));
      };
      return { fetch, calls: () => calls };
    };

    it("stops after 3 consecutive per-player failures (total calls <= 4)", async () => {
      const s = setup(six, sixPlayers());
      const f = counting(500);
      const res = await playerNewsJob({ fetch: f.fetch, limiter: noWait }).run(s.ctx());
      expect(f.calls()).toBeLessThanOrEqual(4);
      expect(res.status).toBe("skipped");
    });

    it("a 429 on the first per-player call stops the loop after that call", async () => {
      const s = setup(six, sixPlayers());
      let calls = 0;
      const fetch: typeof globalThis.fetch = (input, init) => {
        const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!u.includes("playerId=")) return createFixtureFetch()(input, init);
        calls++;
        return Promise.resolve(new Response("slow down", { status: 429 }));
      };
      await playerNewsJob({ fetch, limiter: noWait }).run(s.ctx());
      expect(calls).toBe(1);
    });

    it("a 429 on the recent feed skips the per-player loop", async () => {
      const s = setup(six, sixPlayers());
      const f = counting(429);
      await playerNewsJob({ fetch: f.fetch, limiter: noWait }).run(s.ctx());
      expect(f.calls()).toBe(1);
    });

    it("a hanging ESPN is bounded by the timeout and skips the per-player loop", async () => {
      const s = setup(six, sixPlayers());
      const f = counting("hang");
      const res = await playerNewsJob({ fetch: f.fetch, limiter: noWait, timeoutMs: 20 }).run(
        s.ctx(),
      );
      expect(f.calls()).toBe(1);
      expect(res.status).toBe("skipped");
    });

    it("stops calling when the signal is aborted", async () => {
      const s = setup(six, sixPlayers());
      const ac = new AbortController();
      let calls = 0;
      const fetch: typeof globalThis.fetch = () => {
        calls++;
        ac.abort();
        return Promise.resolve(new Response("x", { status: 500 }));
      };
      await playerNewsJob({ fetch, limiter: noWait }).run(s.ctx({ signal: ac.signal }));
      expect(calls).toBe(1);
    });
  });

  it("per-player feed keeps only the requested athlete and attributes id-less items", async () => {
    const s = setup(["a"], [player("a", "100")]);
    const feed = {
      feed: [
        { id: 1, headline: "mine", published: "2026-10-05T00:00:00Z" },
        { id: 2, headline: "other", published: "2026-10-05T00:00:00Z", playerId: 555 },
        { id: 3, headline: "also mine", published: "2026-10-05T00:00:00Z", playerId: 100 },
      ],
    };
    const fetch: typeof globalThis.fetch = (input) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = u.includes("playerId=") ? feed : { articles: [] };
      return Promise.resolve(Response.json(body));
    };
    await playerNewsJob({ fetch, limiter: noWait }).run(s.ctx());
    expect(newsRows(s.db).map((r) => r.id)).toEqual(["espn:1:a", "espn:3:a"]);
  });

  it("writes a row for each Sleeper player sharing an ESPN id", async () => {
    const s = setup([], [player("p1", "4430027"), player("p2", "4430027")]);
    await playerNewsJob({ fetch: createFixtureFetch(), limiter: noWait }).run(s.ctx());
    const rows = newsRows(s.db);
    expect(new Set(rows.map((r) => r.p))).toEqual(new Set(["p1", "p2"]));
    expect(rows.filter((r) => r.p === "p1").length).toBe(rows.filter((r) => r.p === "p2").length);
  });
});
