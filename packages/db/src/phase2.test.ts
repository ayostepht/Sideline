import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  League,
  LeagueChoice,
  Matchup,
  NflState,
  Player,
  PlayerWeekProjection,
  PlayerWeekStats,
  ScheduleGame,
} from "@sideline/shared";
import {
  dbPathFromDataDir,
  defaultMigrationsFolder,
  migrate,
  openDb,
  type DbHandle,
} from "./connection.js";
import {
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  resolveIdentity,
  setActiveLeagueId,
  setSleeperUserId,
  setSleeperUsername,
} from "./app-settings.js";
import { readUserLeagues, saveUserLeagues } from "./user-leagues.js";
import { claimNext, enqueueRequest, enqueueWithParams, getRequest } from "./sync-bookkeeping.js";
import {
  readKickoffsByTeam,
  readLeaguePlayoffWeekStart,
  readNflState,
  readNflStateFetchedAt,
  readPlayerPositionCounts,
  readStoredMatchupWeeks,
  readStoredProjectionWeeks,
  readStoredStatsWeeks,
  touchNflStateFetchedAt,
} from "./sync-reads.js";
import {
  upsertLeague,
  upsertMatchups,
  upsertNflState,
  upsertPlayerWeekProjections,
  upsertPlayerWeekStats,
  upsertPlayers,
  upsertSchedule,
} from "./upserts.js";

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-p2-"));
  h = openDb(dbPathFromDataDir(dir));
  migrate(h);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
const now = new Date("2026-01-01T00:00:00.000Z");

describe("migration 0001", () => {
  it("keeps existing sync_requests rows with params_json null", () => {
    const old = mkdtempSync(join(tmpdir(), "sideline-mig-"));
    try {
      // Build a folder holding only the first migration.
      const src = defaultMigrationsFolder();
      mkdirSync(join(old, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync(join(src, "meta", "_journal.json"), "utf8")) as {
        entries: { tag: string }[];
      };
      const first = journal.entries[0];
      if (first === undefined) throw new Error("no migrations");
      cpSync(join(src, `${first.tag}.sql`), join(old, `${first.tag}.sql`));
      writeFileSync(
        join(old, "meta", "_journal.json"),
        JSON.stringify({ ...journal, entries: [first] }),
      );
      const h2 = openDb(join(old, "db.sqlite"));
      migrate(h2, old);
      h2.sqlite
        .prepare(
          "INSERT INTO sync_requests (job, requested_at, status, source) VALUES ('state', 'x', 'pending', 'api')",
        )
        .run();
      migrate(h2); // full set
      const row = h2.sqlite.prepare("SELECT job, params_json AS p FROM sync_requests").get();
      expect(row).toEqual({ job: "state", p: null });
      expect(h2.sqlite.prepare("SELECT count(*) AS n FROM user_leagues").get()).toEqual({ n: 0 });
      h2.sqlite.close();
    } finally {
      rmSync(old, { recursive: true, force: true });
    }
  });
});

describe("app settings", () => {
  it("get/set/clear and resolveIdentity prefers DB over env", () => {
    expect(resolveIdentity(h, { sleeperUsername: "env_u" })).toEqual({
      sleeperUsername: "env_u",
      sleeperUserId: null,
      activeLeagueId: null,
    });
    setSleeperUsername(h, "db_u");
    setSleeperUserId(h, "100");
    setActiveLeagueId(h, "L9");
    expect(getSleeperUsername(h)).toBe("db_u");
    expect(getSleeperUserId(h)).toBe("100");
    expect(getActiveLeagueId(h)).toBe("L9");
    expect(resolveIdentity(h, { sleeperUsername: "env_u", activeLeagueId: "E" })).toEqual({
      sleeperUsername: "db_u",
      sleeperUserId: "100",
      activeLeagueId: "L9",
    });
    setActiveLeagueId(h, null);
    expect(getActiveLeagueId(h)).toBeNull();
    expect(resolveIdentity(h, { activeLeagueId: "E" }).activeLeagueId).toBe("E");
  });
});

describe("user leagues", () => {
  const l = (id: string, name: string): LeagueChoice => ({
    leagueId: id,
    name,
    season: 2026,
    totalRosters: 12,
    status: "in_season",
    avatar: null,
  });
  it("replaces per user and season, sorted by name", () => {
    saveUserLeagues(h, "u1", 2026, [l("b", "Zed"), l("a", "Alpha")], now);
    saveUserLeagues(h, "u2", 2026, [l("c", "Other")], now);
    expect(readUserLeagues(h, "u1").map((x) => x.leagueId)).toEqual(["a", "b"]);
    saveUserLeagues(h, "u1", 2026, [l("a", "Renamed")], now);
    expect(readUserLeagues(h, "u1", 2026)).toEqual([{ ...l("a", "Renamed") }]);
    expect(readUserLeagues(h, "u2")).toHaveLength(1);
    expect(readUserLeagues(h, "u1", 2025)).toEqual([]);
  });
});

describe("saveUserLeagues season guard", () => {
  it("throws when a league season differs and writes nothing", () => {
    const l: LeagueChoice = {
      leagueId: "x",
      name: "X",
      season: 2025,
      totalRosters: 10,
      status: "complete",
      avatar: null,
    };
    expect(() => saveUserLeagues(h, "u1", 2026, [l], now)).toThrow(/season/);
    expect(readUserLeagues(h, "u1")).toEqual([]);
  });
});

describe("enqueueWithParams", () => {
  it("round-trips validated params, dedupes on identical params only", () => {
    const a = enqueueWithParams(h, "user", { username: "fake_a" }, "api", now);
    expect(a.created).toBe(true);
    expect(a.request.params).toEqual({ username: "fake_a" });
    expect(enqueueWithParams(h, "user", { username: "fake_a" }, "api", now).created).toBe(false);
    const b = enqueueWithParams(h, "user", { username: "fake_b" }, "api", now);
    expect(b.created).toBe(true);
    expect(claimNext(h, now)?.params).toEqual({ username: "fake_a" });
    expect(getRequest(h, b.request.id)?.params).toEqual({ username: "fake_b" });
  });
  it("rejects invalid params and leaves plain requests without params", () => {
    expect(() => enqueueWithParams(h, "user", { userId: "1", season: 1 }, "api", now)).toThrow();
    const r = enqueueRequest(h, "state", "api", now).request;
    expect(r.params).toBeUndefined();
  });
  it("normalizes username case so Foo and foo dedupe", () => {
    const a = enqueueWithParams(h, "user", { username: " Fake_A " }, "api", now);
    expect(a.request.params).toEqual({ username: "fake_a" });
    expect(enqueueWithParams(h, "user", { username: "FAKE_A" }, "api", now).created).toBe(false);
  });
  it("flags corrupt, invalid or missing stored params with paramsError", () => {
    const r = enqueueWithParams(h, "user_leagues", { userId: "1", season: 2026 }, "api", now);
    h.sqlite
      .prepare("UPDATE sync_requests SET params_json = 'nope' WHERE id = ?")
      .run(r.request.id);
    const got = getRequest(h, r.request.id);
    expect(got?.params).toBeUndefined();
    expect(got?.paramsError).toMatch(/params/);
    h.sqlite
      .prepare("UPDATE sync_requests SET params_json = '{\"userId\":1}' WHERE id = ?")
      .run(r.request.id);
    expect(getRequest(h, r.request.id)?.paramsError).toMatch(/invalid/);
    h.sqlite.prepare("UPDATE sync_requests SET params_json = NULL WHERE id = ?").run(r.request.id);
    expect(getRequest(h, r.request.id)?.paramsError).toMatch(/missing/);
    expect(enqueueRequest(h, "state", "api", now).request.paramsError).toBeUndefined();
  });
});

describe("worker read helpers", () => {
  const state: NflState = {
    season: 2025,
    week: 5,
    seasonType: "regular",
    displayWeek: 5,
    leg: 5,
    previousSeason: 2024,
    seasonStartDate: "2025-09-04",
  };
  it("nfl state read, fetched_at read and touch", () => {
    expect(readNflState(h)).toBeNull();
    expect(readNflStateFetchedAt(h)).toBeNull();
    upsertNflState(h, state, "t1");
    expect(readNflState(h)).toEqual(state);
    expect(readNflStateFetchedAt(h)).toBe("t1");
    touchNflStateFetchedAt(h, "t2");
    expect(readNflStateFetchedAt(h)).toBe("t2");
  });
  it("returns null for an invalid stored season type", () => {
    upsertNflState(h, state, "t1");
    h.sqlite.prepare("UPDATE nfl_state SET season_type = 'bogus' WHERE id = 1").run();
    expect(readNflState(h)).toBeNull();
  });
  it("league playoff week start", () => {
    expect(readLeaguePlayoffWeekStart(h, "L1")).toBeNull();
    const league: League = {
      leagueId: "L1",
      season: 2025,
      name: "L",
      status: "in_season",
      previousLeagueId: null,
      totalRosters: 10,
      rosterPositions: ["QB"],
      scoringSettings: {},
      playoffWeekStart: 15,
      playoffTeams: 6,
      tradeDeadline: null,
      waiverType: 2,
      waiverMode: "faab",
      waiverDayOfWeek: 2,
      waiverClearDays: 1,
      dailyWaivers: false,
      waiverBudget: 100,
      divisions: null,
      reserveSlots: 1,
      taxiSlots: 0,
      leagueAverageMatch: false,
      settings: {},
    };
    upsertLeague(h, league, "t");
    expect(readLeaguePlayoffWeekStart(h, "L1")).toBe(15);
  });
  it("stored weeks (matchups, stats sleeper only, projections)", () => {
    const m = (week: number, leagueId = "L1"): Matchup => ({
      leagueId,
      week,
      rosterId: 1,
      matchupId: 1,
      starters: [],
      startersPoints: [],
      players: [],
      playersPoints: {},
      points: 1,
    });
    upsertMatchups(h, [m(1), m(3), m(3, "L2")]);
    expect(readStoredMatchupWeeks(h, "L1")).toEqual(new Set([1, 3]));
    const st = (
      week: number,
      source: "sleeper" | "nflverse",
      seasonType: "regular" | "post" = "regular",
    ): PlayerWeekStats => ({
      season: 2025,
      seasonType,
      week,
      playerId: "p1",
      stats: { a: 1 },
      source,
    });
    upsertPlayerWeekStats(h, [st(1, "sleeper"), st(2, "nflverse"), st(4, "sleeper", "post")]);
    expect(readStoredStatsWeeks(h, 2025, "regular")).toEqual(new Set([1]));
    expect(readStoredStatsWeeks(h, 2024, "regular")).toEqual(new Set());
    const pr = (week: number): PlayerWeekProjection => ({
      season: 2025,
      seasonType: "regular",
      week,
      playerId: "p1",
      stats: {},
      opponent: null,
      fetchedAt: "t",
      source: "sleeper",
    });
    upsertPlayerWeekProjections(h, [pr(2), pr(6)]);
    expect(readStoredProjectionWeeks(h, 2025, "regular")).toEqual(new Set([2, 6]));
    expect(readStoredProjectionWeeks(h, 2025, "post")).toEqual(new Set());
  });
  it("position counts skip null positions", () => {
    const p = (i: number, position: string | null): Player => ({
      playerId: `p${i}`,
      fullName: `P${i}`,
      firstName: null,
      lastName: null,
      position,
      fantasyPositions: [],
      team: null,
      status: null,
      injuryStatus: null,
      injuryBodyPart: null,
      active: true,
      age: null,
      yearsExp: null,
      depthChartOrder: null,
      searchRank: null,
      gsisId: null,
    });
    upsertPlayers(h, [p(1, "WR"), p(2, "WR"), p(3, "QB"), p(4, null)], "t");
    expect(readPlayerPositionCounts(h)).toEqual(
      new Map([
        ["WR", 2],
        ["QB", 1],
      ]),
    );
  });
  it("kickoffs by team skip null kickoffs", () => {
    const g = (id: string, home: string, away: string, k: string | null): ScheduleGame => ({
      season: 2025,
      week: 5,
      gameId: id,
      gameType: "REG",
      home,
      away,
      kickoffUtc: k,
      kickoffApproximate: false,
      roof: null,
      spreadLine: null,
      totalLine: null,
      homeScore: null,
      awayScore: null,
    });
    upsertSchedule(h, [g("1", "KC", "DEN", "2025-10-05T17:00:00Z"), g("2", "LA", "SF", null)]);
    expect(readKickoffsByTeam(h, 2025, 5)).toEqual(
      new Map([
        ["KC", "2025-10-05T17:00:00Z"],
        ["DEN", "2025-10-05T17:00:00Z"],
      ]),
    );
    expect(readKickoffsByTeam(h, 2025, 6).size).toBe(0);
  });
});
