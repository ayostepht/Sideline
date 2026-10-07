import { readGameWeather, upsertGameWeather, upsertSchedule, type DbHandle } from "@sideline/db";
import type { FetchFn } from "@sideline/providers";
import { createCallCounter, RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "../testutil.js";
import type { JobContext } from "../types.js";
import { createJobRegistry, ALL_ORDER } from "../registry.js";
import { DEFAULT_CADENCES } from "../schedule.js";
import { registeredJobs } from "./index.js";
import { footballNow, weatherJob, WEATHER_MAX_CONSECUTIVE_FAILURES } from "./weather-job.js";

const NOW = "2026-10-07T12:00:00Z";
const instant = { acquire: () => Promise.resolve() };

function game(id: string, home: string, kickoff: string, roof: string | null, extra = {}) {
  return {
    season: 2026,
    week: 5,
    gameId: id,
    gameType: "REG",
    home,
    away: "XXX",
    kickoffUtc: kickoff,
    kickoffApproximate: false,
    roof,
    spreadLine: null,
    totalLine: null,
    homeScore: null,
    awayScore: null,
    ...extra,
  };
}

function hourly(day: string, temp: number) {
  const time = Array.from({ length: 24 }, (_, i) => `${day}T${String(i).padStart(2, "0")}:00`);
  const col = (v: number) => time.map(() => v);
  return {
    hourly: {
      time,
      temperature_2m: col(temp),
      precipitation_probability: col(20),
      wind_speed_10m: col(7),
      wind_gusts_10m: col(12),
      weather_code: col(0),
    },
  };
}

function setup(opts: { gameClock?: string } = {}) {
  const dir = tempDataDir();
  const db: DbHandle = tempDb(dir);
  const clock = fakeClock(NOW);
  const ctx = (): JobContext => ({
    db,
    limiter: new RateLimiter(),
    counter: createCallCounter(),
    now: clock.now,
    logger: silent,
    config: testConfig(
      dir,
      opts.gameClock !== undefined ? { SIDELINE_GAME_CLOCK: opts.gameClock } : {},
    ),
    signal: new AbortController().signal,
  });
  const weather = (id: string) => readGameWeather(db, { season: 2026, gameIds: [id] })[0];
  return { db, clock, ctx, weather };
}

function okFetch(urls: string[] = [], temp = 50): FetchFn {
  return (url) => {
    urls.push(url);
    const day = new URL(url).searchParams.get("start_date") ?? "";
    return Promise.resolve(new Response(JSON.stringify(hourly(day, temp)), { status: 200 }));
  };
}
const failFetch: FetchFn = () => Promise.resolve(new Response("{}", { status: 500 }));

describe("weather job", () => {
  it("writes indoors rows for dome and closed roofs without fetching", async () => {
    const s = setup();
    upsertSchedule(s.db, [
      game("g1", "MIN", "2026-10-08T17:00:00Z", "dome"),
      game("g2", "ATL", "2026-10-08T17:00:00Z", "closed"),
    ]);
    const urls: string[] = [];
    const r = await weatherJob({ fetch: okFetch(urls), limiter: instant }).run(s.ctx());
    expect(urls).toHaveLength(0);
    expect(r.rowsChanged).toBe(2);
    expect(s.weather("g1")).toMatchObject({ status: "indoors", temperatureF: null });
    expect(s.weather("g2")).toMatchObject({ status: "indoors", precipType: null });
  });

  it("upserts a forecast for outdoors, open and unknown roofs, and is idempotent", async () => {
    const s = setup();
    upsertSchedule(s.db, [
      game("g1", "GB", "2026-10-08T17:00:00Z", "outdoors"),
      game("g2", "DAL", "2026-10-08T17:00:00Z", "open"),
      game("g3", "KC", "2026-10-09T17:00:00Z", null),
    ]);
    const urls: string[] = [];
    const job = weatherJob({ fetch: okFetch(urls), limiter: instant });
    const r = await job.run(s.ctx());
    expect(urls).toHaveLength(3);
    expect(r.rowsChanged).toBe(3);
    expect(s.weather("g1")).toMatchObject({
      status: "forecast",
      temperatureF: 50,
      windMph: 7,
      gustMph: 12,
      precipProbability: 20,
      precipType: "none",
      fetchedAt: "2026-10-07T12:00:00.000Z",
    });
    s.clock.advance(3 * 3_600_000);
    const again = await job.run(s.ctx());
    expect(again.rowsChanged).toBe(0);
  });

  it("keeps an existing row when the fetch fails", async () => {
    const s = setup();
    upsertSchedule(s.db, [game("g1", "GB", "2026-10-08T17:00:00Z", "outdoors")]);
    await weatherJob({ fetch: okFetch([], 40), limiter: instant }).run(s.ctx());
    const before = s.weather("g1");
    const r = await weatherJob({ fetch: failFetch, limiter: instant }).run(s.ctx());
    expect(s.weather("g1")).toEqual(before);
    expect(r.rowsChanged).toBe(0);
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/degraded/);
  });

  it("writes unavailable when the fetch fails and no row exists", async () => {
    const s = setup();
    upsertSchedule(s.db, [game("g1", "GB", "2026-10-08T17:00:00Z", "outdoors")]);
    const r = await weatherJob({ fetch: failFetch, limiter: instant }).run(s.ctx());
    expect(s.weather("g1")).toMatchObject({ status: "unavailable", fetchedAt: null });
    expect(r.rowsChanged).toBe(1);
  });

  it("writes unavailable for an unknown stadium without fetching", async () => {
    const s = setup();
    upsertSchedule(s.db, [game("g1", "ZZZ", "2026-10-08T17:00:00Z", "outdoors")]);
    const urls: string[] = [];
    await weatherJob({ fetch: okFetch(urls), limiter: instant }).run(s.ctx());
    expect(urls).toHaveLength(0);
    expect(s.weather("g1")).toMatchObject({ status: "unavailable" });
  });

  it("only covers games from football now through 7 days later", async () => {
    const s = setup();
    upsertSchedule(s.db, [
      game("past", "GB", "2026-10-07T11:59:00.000Z", "outdoors"),
      game("edge_in", "GB", "2026-10-14T12:00:00.000Z", "outdoors"),
      game("edge_out", "GB", "2026-10-14T12:01:00.000Z", "outdoors"),
      game("tbd", "GB", "2026-10-10T12:00:00Z", "outdoors", { kickoffUtc: null }),
    ]);
    await weatherJob({ fetch: okFetch(), limiter: instant }).run(s.ctx());
    expect(s.weather("edge_in")?.status).toBe("forecast");
    for (const id of ["past", "edge_out", "tbd"]) expect(s.weather(id), id).toBeUndefined();
  });

  it("uses the game clock override as football now", async () => {
    const s = setup({ gameClock: "2026-10-01T00:00:00Z" });
    expect(footballNow(s.ctx()).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    upsertSchedule(s.db, [
      game("early", "GB", "2026-10-02T17:00:00Z", "outdoors"),
      game("late", "GB", "2026-10-08T17:00:00Z", "outdoors"),
    ]);
    await weatherJob({ fetch: okFetch(), limiter: instant }).run(s.ctx());
    expect(s.weather("early")?.status).toBe("forecast");
    expect(s.weather("late")).toBeUndefined();
  });

  it("does nothing when no games are in the window", async () => {
    const s = setup();
    const r = await weatherJob({ fetch: okFetch(), limiter: instant }).run(s.ctx());
    expect(r).toMatchObject({ rowsChanged: 0 });
  });

  it("stops after consecutive failures, never throwing", async () => {
    const s = setup();
    const homes = ["GB", "CHI", "BUF", "CIN", "TB"];
    upsertSchedule(
      s.db,
      homes.map((h, i) => game(`g${i}`, h, `2026-10-08T1${i}:00:00Z`, "outdoors")),
    );
    let calls = 0;
    const counting: FetchFn = () => {
      calls++;
      return Promise.resolve(new Response("{}", { status: 503 }));
    };
    const r = await weatherJob({ fetch: counting, limiter: instant }).run(s.ctx());
    expect(calls).toBe(WEATHER_MAX_CONSECUTIVE_FAILURES);
    expect(r.status).toBe("skipped");
    expect(s.weather("g0")?.status).toBe("unavailable");
    expect(s.weather("g4")).toBeUndefined();
  });

  it("counts HTTP 400 for in-range games toward the failure cap", async () => {
    const s = setup();
    const homes = ["GB", "CHI", "BUF", "CIN", "TB"];
    upsertSchedule(
      s.db,
      homes.map((h, i) => game(`g${i}`, h, `2026-10-08T1${i}:00:00Z`, "outdoors")),
    );
    let calls = 0;
    const bad: FetchFn = () => {
      calls++;
      return Promise.resolve(new Response("{}", { status: 400 }));
    };
    const r = await weatherJob({ fetch: bad, limiter: instant }).run(s.ctx());
    expect(calls).toBe(WEATHER_MAX_CONSECUTIVE_FAILURES);
    expect(r.status).toBe("skipped");
    expect(s.weather("g4")).toBeUndefined();
  });

  it("a thrown fetch error degrades instead of failing", async () => {
    const s = setup();
    upsertSchedule(s.db, [game("g1", "GB", "2026-10-08T17:00:00Z", "outdoors")]);
    const boom: FetchFn = () => Promise.reject(new Error("offline"));
    const r = await weatherJob({ fetch: boom, limiter: instant }).run(s.ctx());
    expect(r.status).toBe("skipped");
  });

  it("does not touch rows for games outside the window", async () => {
    const s = setup();
    upsertGameWeather(s.db, [
      {
        season: 2026,
        week: 1,
        gameId: "old",
        kickoffUtc: "2026-09-10T00:00:00Z",
        status: "forecast",
        temperatureF: 70,
        windMph: 1,
        gustMph: 2,
        precipProbability: 0,
        precipType: "none",
        fetchedAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await weatherJob({ fetch: okFetch(), limiter: instant }).run(s.ctx());
    expect(s.weather("old")?.temperatureF).toBe(70);
  });
});

describe("weather registration", () => {
  it("is registered, scheduled every 3 hours and runs after nflverse in all", () => {
    expect(createJobRegistry(registeredJobs).has("weather")).toBe(true);
    expect(DEFAULT_CADENCES.weather).toEqual({ every: 3 * 3_600_000 });
    expect(ALL_ORDER.indexOf("weather")).toBeGreaterThan(ALL_ORDER.indexOf("nflverse"));
  });
});
