import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvTable } from "./csv.js";
import { type FetchFn, fetchKickoffForecast, precipTypeFromWmo } from "./index.js";
import { mapSchedule, SLEEPER_TEAMS } from "./schedule.js";
import { INTERNATIONAL_STADIUMS, stadiumLocation, TEAM_STADIUMS } from "./stadiums.js";

const FIX = resolve(import.meta.dirname, "../../../tests/fixtures/open-meteo/forecast.json");
const fixture: unknown = JSON.parse(await readFile(FIX, "utf8"));
const NOW = new Date("2026-10-07T12:00:00Z");

function fx(body: unknown, status = 200): { fetch: FetchFn; urls: string[]; ua: string[] } {
  const urls: string[] = [];
  const ua: string[] = [];
  const f: FetchFn = (url, init) => {
    urls.push(url);
    ua.push(String((init?.headers as Record<string, string> | undefined)?.["User-Agent"]));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetch: f, urls, ua };
}

type Hourly = Record<string, unknown[]>;
const hourly = (fixture as { hourly: Hourly }).hourly;
const at = (key: string, i: number): unknown => hourly[key]?.[i];

describe("fetchKickoffForecast", () => {
  const base = { lat: 44.5013, lon: -88.0622, now: NOW };

  it("picks the kickoff-hour row and sends unit params", async () => {
    const s = fx(fixture);
    const r = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00.000Z",
      fetch: s.fetch,
    });
    expect(r).toEqual({
      ok: true,
      forecast: {
        temperatureF: at("temperature_2m", 17),
        windMph: at("wind_speed_10m", 17),
        gustMph: at("wind_gusts_10m", 17),
        precipProbability: at("precipitation_probability", 17),
        precipType: precipTypeFromWmo(at("weather_code", 17) as number),
      },
    });
    expect(s.urls).toHaveLength(1);
    const u = new URL(s.urls[0] ?? "");
    expect(u.origin + u.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(u.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(u.searchParams.get("wind_speed_unit")).toBe("mph");
    expect(u.searchParams.get("timezone")).toBe("UTC");
    expect(u.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
    );
    expect(u.searchParams.get("start_date")).toBe("2026-10-11");
    expect(u.searchParams.get("end_date")).toBe("2026-10-11");
    expect(s.ua[0]).toMatch(/^Sideline\//);
  });

  it("floors a :30 kickoff to the hour", async () => {
    const a = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T20:30:00Z",
      fetch: fx(fixture).fetch,
    });
    expect(a.ok && a.forecast.temperatureF).toBe(at("temperature_2m", 20));
    expect(a.ok && a.forecast.temperatureF).not.toBe(at("temperature_2m", 21));
  });

  it("degrades on zod failure, bad HTTP, missing hour, null data, bad kickoff", async () => {
    const bad = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: fx({ hourly: { time: 5 } }).fetch,
    });
    expect(bad).toMatchObject({ ok: false, reason: "parse" });
    const http = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: fx({}, 429).fetch,
    });
    expect(http).toMatchObject({ ok: false, reason: "network" });
    const noHour = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-12T05:00:00Z",
      fetch: fx({ hourly: { ...hourly, time: ["2026-10-11T00:00"] } }).fetch,
    });
    expect(noHour).toMatchObject({ ok: false, reason: "no_hour" });
    const nulls = {
      hourly: { ...hourly, temperature_2m: hourly["temperature_2m"]?.map(() => null) },
    };
    const nd = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: fx(nulls).fetch,
    });
    expect(nd).toMatchObject({ ok: false, reason: "no_data" });
    expect(await fetchKickoffForecast({ ...base, kickoffUtc: "nope" })).toMatchObject({
      ok: false,
      reason: "invalid_kickoff",
    });
    const notJson: FetchFn = () => Promise.resolve(new Response("<html>", { status: 200 }));
    expect(
      await fetchKickoffForecast({ ...base, kickoffUtc: "2026-10-11T17:00:00Z", fetch: notJson }),
    ).toMatchObject({ ok: false, reason: "network" });
  });

  it("uses wind for a null gust and none for a null weather code", async () => {
    const body = {
      hourly: {
        ...hourly,
        wind_gusts_10m: hourly["wind_gusts_10m"]?.map(() => null),
        weather_code: hourly["weather_code"]?.map(() => null),
      },
    };
    const r = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: fx(body).fetch,
    });
    expect(r.ok && r.forecast.gustMph).toBe(at("wind_speed_10m", 17));
    expect(r.ok && r.forecast.precipType).toBe("none");
  });

  it("times out", async () => {
    const hang: FetchFn = (_u, init) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      });
    const r = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: hang,
      timeoutMs: 20,
    });
    expect(r).toMatchObject({ ok: false, reason: "network" });
    expect(!r.ok && r.message).toMatch(/timed out/);
  });

  it("short-circuits beyond 16 days with zero fetch calls", async () => {
    const s = fx(fixture);
    const r = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-24T17:00:00Z",
      fetch: s.fetch,
    });
    expect(r).toEqual({ ok: false, reason: "out_of_range" });
    expect(s.urls).toHaveLength(0);
    const edge = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-22T23:00:00Z",
      fetch: fx(fixture).fetch,
    });
    expect(edge.ok || edge.reason !== "out_of_range").toBe(true);
  });

  it("allows day +15, rejects +16 and any earlier UTC day without fetching", async () => {
    const day15 = fx(fixture);
    await fetchKickoffForecast({ ...base, kickoffUtc: "2026-10-22T00:00:00Z", fetch: day15.fetch });
    expect(day15.urls).toHaveLength(1);
    for (const kickoffUtc of ["2026-10-23T00:00:00Z", "2026-10-06T23:59:00Z"]) {
      const s = fx(fixture);
      const r = await fetchKickoffForecast({ ...base, kickoffUtc, fetch: s.fetch });
      expect(r, kickoffUtc).toEqual({ ok: false, reason: "out_of_range" });
      expect(s.urls).toHaveLength(0);
    }
    // Earlier the same UTC day still fetches.
    const same = fx(fixture);
    await fetchKickoffForecast({ ...base, kickoffUtc: "2026-10-07T01:00:00Z", fetch: same.fetch });
    expect(same.urls).toHaveLength(1);
  });

  it("maps HTTP 400 to out_of_range", async () => {
    const r = await fetchKickoffForecast({
      ...base,
      kickoffUtc: "2026-10-11T17:00:00Z",
      fetch: fx({ error: true }, 400).fetch,
    });
    expect(r).toMatchObject({ ok: false, reason: "out_of_range" });
  });
});

describe("WMO mapping", () => {
  it.each([
    [0, "none"],
    [3, "none"],
    [45, "none"],
    [48, "none"],
    [999, "none"],
    [51, "rain"],
    [55, "rain"],
    [61, "rain"],
    [65, "rain"],
    [80, "rain"],
    [82, "rain"],
    [95, "rain"],
    [96, "rain"],
    [99, "rain"],
    [71, "snow"],
    [75, "snow"],
    [77, "snow"],
    [85, "snow"],
    [86, "snow"],
    [56, "mixed"],
    [57, "mixed"],
    [66, "mixed"],
    [67, "mixed"],
  ] as const)("code %i is %s", (code, expected) => {
    expect(precipTypeFromWmo(code)).toBe(expected);
  });
});

describe("stadiumLocation", () => {
  it("resolves all 32 schedule team codes", () => {
    expect(SLEEPER_TEAMS.size).toBe(32);
    for (const t of SLEEPER_TEAMS) {
      const s = stadiumLocation({ home: t });
      expect(s, t).not.toBeNull();
      expect(Math.abs(s?.lat ?? 0)).toBeGreaterThan(0);
    }
    expect(Object.keys(TEAM_STADIUMS)).toHaveLength(32);
    expect(stadiumLocation({ home: "LAR" })).toEqual(stadiumLocation({ home: "LAC" }));
    expect(stadiumLocation({ home: "NYG" })).toEqual(stadiumLocation({ home: "NYJ" }));
    expect(stadiumLocation({ home: "LA" })).toBeNull();
  });

  it("prefers a known stadium id, falls back to home, and returns null when unknown", () => {
    for (const id of [
      "LON00",
      "LON02",
      "MAD01",
      "MEL00",
      "MEX00",
      "MUN01",
      "PAR00",
      "RIO00",
      "SAO00",
      "GER00",
      "FRA00",
    ]) {
      expect(INTERNATIONAL_STADIUMS[id], id).toBeDefined();
      expect(stadiumLocation({ home: "JAX", stadiumId: id })).toBe(INTERNATIONAL_STADIUMS[id]);
    }
    expect(stadiumLocation({ home: "JAX", stadiumId: "ZZZ99" })).toBe(TEAM_STADIUMS["JAX"]);
    expect(stadiumLocation({ home: "JAX", stadiumId: null })).toBe(TEAM_STADIUMS["JAX"]);
    expect(stadiumLocation({ home: "XX", stadiumId: "ZZZ99" })).toBeNull();
  });
});

describe("mapSchedule stadiumId", () => {
  const hdr =
    "game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,roof,spread_line,total_line";
  const row = (id: string, home: string, extra = ""): string =>
    `${id},2026,REG,1,2026-09-13,13:00,BUF,,${home},,outdoors,1,40${extra}`;

  it("carries stadium_id, null when blank or the column is absent", () => {
    const t = parseCsvTable(
      `${hdr},stadium_id\n${row("a", "LA", ",MEL00")}\n${row("b", "KC", ",")}\n`,
    );
    const m = mapSchedule(t, 2026);
    if ("error" in m) throw new Error(m.error);
    expect(m.games.map((g) => [g.home, g.stadiumId])).toEqual([
      ["LAR", "MEL00"],
      ["KC", null],
    ]);
    const old = mapSchedule(parseCsvTable(`${hdr}\n${row("c", "KC")}\n`), 2026);
    if ("error" in old) throw new Error(old.error);
    expect(old.games[0]?.stadiumId).toBeNull();
  });
});
