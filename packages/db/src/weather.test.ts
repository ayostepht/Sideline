import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScheduleGame } from "@sideline/shared";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "./connection.js";
import { readGameWeather, readOutdoorGamesBetween } from "./derived-reads.js";
import { upsertGameWeather, upsertSchedule, type GameWeatherUpsertRow } from "./upserts.js";

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-wx-"));
  h = openDb(dbPathFromDataDir(dir));
  migrate(h);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const wx = (gameId: string, o: Partial<GameWeatherUpsertRow> = {}): GameWeatherUpsertRow => ({
  season: 2026,
  week: 5,
  gameId,
  kickoffUtc: "2026-10-11T17:00:00.000Z",
  status: "forecast",
  temperatureF: 60,
  windMph: 5,
  gustMph: 10,
  precipProbability: 10,
  precipType: "none",
  fetchedAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
  ...o,
});

const game = (gameId: string, kickoffUtc: string | null, extra = {}): ScheduleGame => ({
  season: 2026,
  week: 5,
  gameId,
  gameType: "REG",
  home: "KC",
  away: "DEN",
  kickoffUtc,
  kickoffApproximate: false,
  roof: "outdoors",
  spreadLine: null,
  totalLine: null,
  homeScore: null,
  awayScore: null,
  ...extra,
});

describe("upsertGameWeather", () => {
  it("inserts, is idempotent, and counts real changes only", () => {
    expect(upsertGameWeather(h, [wx("a"), wx("b")]).rowsChanged).toBe(2);
    expect(upsertGameWeather(h, [wx("a"), wx("b")]).rowsChanged).toBe(0);
    // Only fetch timestamps differ: not a change.
    expect(
      upsertGameWeather(h, [wx("a", { fetchedAt: "2026-10-09T15:00:00.000Z" })]).rowsChanged,
    ).toBe(0);
    expect(upsertGameWeather(h, [wx("a", { windMph: 20 })]).rowsChanged).toBe(1);
    expect(upsertGameWeather(h, []).rowsChanged).toBe(0);
  });
});

describe("readGameWeather", () => {
  it("derives flags on read and returns nulls for indoors", () => {
    upsertGameWeather(h, [
      wx("a", { windMph: 15 }),
      wx("b", {
        status: "indoors",
        temperatureF: null,
        windMph: null,
        gustMph: null,
        precipProbability: null,
        precipType: null,
        fetchedAt: null,
      }),
      wx("c"),
    ]);
    const rows = readGameWeather(h, { season: 2026, gameIds: ["a", "b"] });
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.gameId === "a");
    const b = rows.find((r) => r.gameId === "b");
    expect(a?.flags).toEqual(["wind"]);
    expect(b).toMatchObject({
      status: "indoors",
      temperatureF: null,
      windMph: null,
      precipType: null,
      fetchedAt: null,
      flags: [],
    });
    expect(readGameWeather(h, { season: 2025, gameIds: ["a"] })).toEqual([]);
    expect(readGameWeather(h, { season: 2026, gameIds: [] })).toEqual([]);
  });
});

describe("readOutdoorGamesBetween and stadiumId", () => {
  it("respects window bounds, skips null kickoffs, returns all roofs and stadium ids", () => {
    upsertSchedule(h, [
      game("early", "2026-10-10T00:00:00.000Z"),
      game("in1", "2026-10-11T17:00:00.000Z", { stadiumId: "LON00", roof: "dome" }),
      game("in2", "2026-10-12T00:20:00.000Z"),
      game("late", "2026-10-20T00:00:00.000Z"),
      game("tbd", null),
    ]);
    const rows = readOutdoorGamesBetween(h, {
      fromUtc: "2026-10-11T00:00:00.000Z",
      toUtc: "2026-10-13T00:00:00.000Z",
    });
    expect(rows.map((r) => r.gameId)).toEqual(["in1", "in2"]);
    expect(rows[0]).toEqual({
      season: 2026,
      week: 5,
      gameId: "in1",
      kickoffUtc: "2026-10-11T17:00:00.000Z",
      home: "KC",
      away: "DEN",
      roof: "dome",
      stadiumId: "LON00",
    });
    expect(rows[1]?.stadiumId).toBeNull();
  });
});

describe("upsertSchedule stadium_id (m1)", () => {
  it("keeps the stored stadium id when a later row omits it, and updates when given", () => {
    upsertSchedule(h, [{ ...game("a", "2026-10-11T17:00:00.000Z"), stadiumId: "KAN00" }]);
    const stadium = (): unknown =>
      (
        h.sqlite.prepare("SELECT stadium_id AS s FROM schedule WHERE game_id = 'a'").get() as {
          s: string | null;
        }
      ).s;
    expect(stadium()).toBe("KAN00");
    upsertSchedule(h, [{ ...game("a", "2026-10-11T17:00:00.000Z"), homeScore: 3 }]);
    expect(stadium()).toBe("KAN00");
    upsertSchedule(h, [{ ...game("a", "2026-10-11T17:00:00.000Z"), stadiumId: "LON00" }]);
    expect(stadium()).toBe("LON00");
  });
});
