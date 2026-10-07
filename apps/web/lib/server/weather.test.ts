import { setSleeperUserId, upsertGameWeather, type DbHandle } from "@sideline/db";
import { LineupResponseSchema, MatchupResponseSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getLineup } from "./lineup";
import { getMatchup } from "./matchup";
import { nextOpponentsFor } from "./next-opponents";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";
import { weatherReasons } from "./weather";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

const STAMP = "2026-10-02T11:00:00.000Z";
const KICK = "2026-10-04T17:00:00.000Z"; // within 7 days of SEED_NOW
const wx = (gameId: string, week: number, o: Record<string, unknown> = {}) => ({
  season: 2026,
  week,
  gameId,
  kickoffUtc: KICK,
  status: "forecast" as const,
  temperatureF: 55,
  windMph: 5,
  gustMph: 9,
  precipProbability: 5,
  precipType: "none" as const,
  fetchedAt: STAMP,
  updatedAt: STAMP,
  ...o,
});

/**
 * Seed: nflState week 5. Roster 1 owns p1..p8 (teams T02..T09); T01/T02 are on bye in week 5.
 * Week 5 games: 5_T03_T04 (p2,p3), 5_T05_T06 (p4,p5), 5_T07_T08 (p6,p7), 5_T09_T10 (p8).
 * Roster 2 owns p9..p16.
 */
function setup(withWeather: boolean): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, { schedule: true });
  h.sqlite.prepare("UPDATE schedule SET kickoff_utc = ? WHERE week = 5").run(KICK);
  h.sqlite
    .prepare("UPDATE schedule SET kickoff_utc = ? WHERE week = 6")
    .run("2026-10-09T12:00:00.000Z");
  h.sqlite
    .prepare("UPDATE schedule SET kickoff_utc = ? WHERE week IN (7, 8)")
    .run("2026-10-16T17:00:00.000Z");
  for (const rosterId of [1, 2]) {
    h.sqlite
      .prepare(
        `INSERT INTO matchups (league_id, week, roster_id, matchup_id, starters_json, players_json,
           players_points_json, points) VALUES ('L1', 5, ?, 1, '[]', '[]', '{}', 0)`,
      )
      .run(rosterId);
  }
  setSleeperUserId(h, "u1");
  if (withWeather) {
    upsertGameWeather(h, [
      wx("5_T03_T04", 5, { windMph: 18, gustMph: 31, temperatureF: 21 }), // wind + cold
      wx("5_T05_T06", 5, {
        status: "indoors",
        temperatureF: null,
        windMph: null,
        gustMph: null,
        precipProbability: null,
        precipType: null,
        fetchedAt: null,
      }),
      wx("5_T09_T10", 5, {
        status: "unavailable",
        temperatureF: null,
        windMph: null,
        gustMph: null,
        precipProbability: null,
        precipType: null,
        fetchedAt: null,
      }),
    ]);
  }
  return h;
}

function lineup(h: DbHandle) {
  const r = getLineup(h, "L1", { mode: "projected", rosterId: 1, week: 5 }, SEED_NOW);
  if (!r.ok) throw new Error(r.reason);
  return LineupResponseSchema.parse(r.data);
}

describe("lineup weather", () => {
  it("flags wind and cold, keeps indoors and unavailable quiet, synthesizes a missing row", () => {
    const h = setup(true);
    const by = new Map(lineup(h).players.map((p) => [p.playerId, p] as const));
    const wind = by.get("p2");
    expect(wind?.weather?.status).toBe("forecast");
    expect(wind?.weather?.flags).toEqual(["wind", "cold"]);
    expect(wind?.reasons.filter((r) => r.code === "WEATHER").map((r) => r.label)).toEqual([
      "Wind 18 mph",
      "Cold: 21°F",
    ]);
    expect(wind?.reasons.find((r) => r.code === "WEATHER")?.impact).toBeUndefined();
    const dome = by.get("p4");
    expect(dome?.weather?.status).toBe("indoors");
    expect(dome?.reasons.some((r) => r.code === "WEATHER")).toBe(false);
    const gone = by.get("p8");
    expect(gone?.weather?.status).toBe("unavailable");
    expect(gone?.weather?.fetchedAt).toBeNull();
    expect(gone?.reasons.some((r) => r.code === "WEATHER")).toBe(false);
    // No stored row, kickoff within 7 days: synthesized.
    const synth = by.get("p6")?.weather;
    expect(synth).toMatchObject({ status: "unavailable", gameId: "5_T07_T08", flags: [] });
    expect(synth?.kickoffUtc).toBe(KICK);
    // Bye: no game.
    expect(by.get("p1")?.weather).toBeNull();
  });

  it("returns null for a game beyond the 7-day window with no row", () => {
    const h = setup(true);
    h.sqlite
      .prepare("UPDATE schedule SET kickoff_utc = ? WHERE week = 5")
      .run("2026-10-20T17:00:00.000Z");
    const by = new Map(lineup(h).players.map((p) => [p.playerId, p] as const));
    expect(by.get("p6")?.weather).toBeNull();
  });

  it("is context only: values, assignments and win probability do not change", () => {
    const strip = (r: ReturnType<typeof lineup>) => ({
      ...r,
      players: r.players.map((p) => ({
        ...p,
        weather: null,
        reasons: p.reasons.filter((x) => x.code !== "WEATHER"),
      })),
    });
    const withWx = setup(true);
    const a = lineup(withWx);
    const matchA = getMatchup(withWx, "L1", { week: 5, rosterId: 1 }, SEED_NOW);
    tmp?.cleanup();
    const without = setup(false);
    const b = lineup(without);
    const matchB = getMatchup(without, "L1", { week: 5, rosterId: 1 }, SEED_NOW);
    expect(strip(a)).toEqual(strip(b));
    expect(a.players.some((p) => p.reasons.some((r) => r.code === "WEATHER"))).toBe(true);
    expect(b.players.some((p) => p.reasons.some((r) => r.code === "WEATHER"))).toBe(false);
    expect(matchA.ok && matchB.ok).toBe(true);
    if (matchA.ok && matchB.ok) {
      expect(matchA.data.winProbability).toBe(matchB.data.winProbability);
      expect(matchA.data.team).toEqual(matchB.data.team);
      expect(matchA.data.swingPlayers.map((s) => [s.playerId, s.varianceContribution])).toEqual(
        matchB.data.swingPlayers.map((s) => [s.playerId, s.varianceContribution]),
      );
    }
  });
});

describe("next opponents weather", () => {
  it("carries the stored forecast, synthesizes inside 7 days, and is null beyond", () => {
    const h = setup(true);
    const p = { position: "RB", team: "T03" };
    const r = nextOpponentsFor(h, "L1", 2026, p, SEED_NOW);
    const byWeek = new Map(r.weeks.map((w) => [w.week, w] as const));
    expect(byWeek.get(5)?.weather?.flags).toEqual(["wind", "cold"]);
    // Week 6 is T03's bye: no game, no weather.
    expect(byWeek.get(6)?.bye).toBe(true);
    expect(byWeek.get(6)?.weather).toBeNull();
    // Week 7 kicks off 14 days out with no row.
    expect(byWeek.get(7)?.weather).toBeNull();
    // Week 6 games inside the window for a team that plays: synthesized.
    const q = nextOpponentsFor(h, "L1", 2026, { position: "RB", team: "T05" }, SEED_NOW);
    expect(q.weeks.find((w) => w.week === 5)?.weather?.status).toBe("indoors");
    expect(q.weeks.find((w) => w.week === 6)?.weather).toMatchObject({
      status: "unavailable",
      fetchedAt: null,
    });
  });
});

describe("matchup weather", () => {
  it("attaches each starter's game forecast", () => {
    const h = setup(true);
    const r = getMatchup(h, "L1", { week: 5, rosterId: 1 }, SEED_NOW);
    if (!r.ok) throw new Error(r.reason);
    const data = MatchupResponseSchema.parse(r.data);
    const by = new Map(data.swingPlayers.map((s) => [s.playerId, s] as const));
    expect(by.get("p2")?.weather?.flags).toEqual(["wind", "cold"]);
    expect(by.get("p4")?.weather?.status).toBe("indoors");
    expect(by.get("p1")?.weather).toBeNull(); // bye
  });
});

describe("weather team-code handling (P7b.9f)", () => {
  it("finds the game for an away team and for a Sleeper code needing conversion (LAR -> LA)", () => {
    const h = setup(true);
    // p2 (Sleeper LAR) is the away side of 5_T03_T04; nflverse stores that side as LA.
    h.sqlite.prepare("UPDATE players SET team = 'LAR' WHERE player_id = 'p2'").run();
    h.sqlite
      .prepare("UPDATE schedule SET away = 'LA' WHERE game_id = '5_T03_T04' AND week = 5")
      .run();
    const by = new Map(lineup(h).players.map((p) => [p.playerId, p] as const));
    expect(by.get("p2")?.weather).toMatchObject({ gameId: "5_T03_T04", status: "forecast" });
    expect(by.get("p2")?.reasons.filter((r) => r.code === "WEATHER")).toHaveLength(2);

    const m = getMatchup(h, "L1", { week: 5, rosterId: 1 }, SEED_NOW);
    if (!m.ok) throw new Error(m.reason);
    expect(m.data.swingPlayers.find((s) => s.playerId === "p2")?.weather?.gameId).toBe("5_T03_T04");

    const n = nextOpponentsFor(h, "L1", 2026, { position: "RB", team: "LAR" }, SEED_NOW);
    expect(n.weeks.find((w) => w.week === 5)?.weather?.gameId).toBe("5_T03_T04");
  });
});

describe("weatherReasons", () => {
  const base = wx("g", 5);
  const w = (o: Record<string, unknown>) => ({
    ...base,
    ...o,
  });
  it("labels each flag once in plain text", () => {
    const labels = (o: Record<string, unknown>, flags: ("wind" | "precip" | "cold")[]) =>
      weatherReasons({ ...w(o), flags }).map((r) => r.label);
    expect(labels({ windMph: 10, gustMph: 31 }, ["wind"])).toEqual(["Gusts 31 mph"]);
    expect(labels({ precipProbability: 70, precipType: "rain" }, ["precip"])).toEqual([
      "Rain likely (70%)",
    ]);
    expect(labels({ precipProbability: 60, precipType: "snow" }, ["precip"])).toEqual([
      "Snow likely (60%)",
    ]);
    expect(weatherReasons(null)).toEqual([]);
  });
});
