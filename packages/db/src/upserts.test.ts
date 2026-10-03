import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  League,
  LeagueUser,
  Matchup,
  Player,
  PlayerWeekProjection,
  Roster,
  ScheduleGame,
  UsageWeek,
  Transaction,
} from "@sideline/shared";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "./connection.js";
import {
  createDbEtagStore,
  dbCheck,
  getComputed,
  invalidateComputed,
  putComputed,
  tableCounts,
  type DbEtagStore,
} from "./cache.js";
import {
  replaceTrending,
  stableJson,
  upsertDefenseVsPosition,
  upsertLeague,
  upsertLeaguePlayerWeekPoints,
  upsertLeagueUsers,
  upsertMatchups,
  upsertNflState,
  upsertPlayerWeekProjections,
  upsertPlayerWeekStats,
  upsertPlayers,
  upsertProjectionSnapshots,
  upsertRosters,
  upsertSchedule,
  upsertTransactions,
  upsertUsageWeek,
  type UpsertDefenseVsPositionRow,
  type UpsertLeaguePlayerWeekPointsRow,
  type UpsertResult,
} from "./upserts.js";

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-upsert-"));
  h = openDb(dbPathFromDataDir(dir));
  migrate(h);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

/** insert N -> N, identical -> 0, one field changed -> 1. */
function checkIdempotent<T>(
  rows: T[],
  upsert: (rows: T[], stamp: string) => UpsertResult,
  mutate: (rows: T[]) => T[],
): void {
  expect(upsert(rows, "t1").rowsChanged).toBe(rows.length);
  expect(upsert(rows, "t2").rowsChanged).toBe(0);
  expect(upsert(mutate(rows), "t3").rowsChanged).toBe(1);
}

const league: League = {
  leagueId: "L1",
  season: 2025,
  name: "L",
  status: "in_season",
  previousLeagueId: null,
  totalRosters: 10,
  rosterPositions: ["QB", "RB"],
  scoringSettings: { rec: 1, pass_td: 4 },
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
  settings: { b: 1, a: 2 },
};
const roster = (id: number): Roster => ({
  leagueId: "L1",
  rosterId: id,
  ownerId: "u1",
  players: ["1", "2"],
  starters: ["1", "0"],
  reserve: [],
  taxi: [],
  wins: 1,
  losses: 0,
  ties: 0,
  fpts: 10.5,
  fptsAgainst: 3,
  waiverPosition: null,
  waiverBudgetUsed: 0,
});
const player = (i: number): Player => ({
  playerId: `p${i}`,
  fullName: `Player ${i}`,
  firstName: "P",
  lastName: `${i}`,
  position: "WR",
  fantasyPositions: ["WR"],
  team: "KC",
  status: "Active",
  injuryStatus: null,
  injuryBodyPart: null,
  active: true,
  age: 25.5,
  yearsExp: 3,
  depthChartOrder: null,
  searchRank: i,
  gsisId: null,
});
const proj = (id: string, week: number, fetchedAt: string, pts = 10): PlayerWeekProjection => ({
  season: 2025,
  seasonType: "regular",
  week,
  playerId: id,
  stats: { pts_ppr: pts },
  opponent: "DEN",
  fetchedAt,
  source: "sleeper",
});

describe("upserts", () => {
  it("stableJson sorts keys", () => {
    expect(stableJson({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}',
    );
  });

  it("league", () => {
    checkIdempotent(
      [league],
      (r, s) => upsertLeague(h, r[0] as League, s),
      ([l]) => [{ ...(l as League), name: "New", settings: { a: 2, b: 1, c: 0 } }],
    );
    // key order does not matter
    expect(
      upsertLeague(h, { ...league, name: "New", settings: { a: 2, b: 1, c: 0 } }, "t9").rowsChanged,
    ).toBe(0);
  });

  it("leagueUsers", () => {
    const rows = [1, 2].map((i): LeagueUser => ({
      leagueId: "L1",
      userId: `u${i}`,
      displayName: `n${i}`,
      teamName: null,
      avatar: null,
    }));
    checkIdempotent(
      rows,
      (r) => upsertLeagueUsers(h, r),
      (r) => [{ ...(r[0] as LeagueUser), teamName: "T" }, ...r.slice(1)],
    );
  });

  it("rosters", () => {
    checkIdempotent(
      [roster(1), roster(2)],
      (r, s) => upsertRosters(h, r, s),
      (r) => [{ ...(r[0] as Roster), fpts: 11 }, ...r.slice(1)],
    );
    const row = h.sqlite
      .prepare("SELECT starters_json AS s, synced_at AS t FROM rosters WHERE roster_id = 2")
      .get() as { s: string; t: string };
    expect(row.s).toBe('["1","0"]');
    expect(row.t).toBe("t1");
  });

  it("players", () => {
    checkIdempotent(
      [player(1), player(2)],
      (r, s) => upsertPlayers(h, r, s),
      (r) => [{ ...(r[0] as Player), team: "DEN", active: null }, ...r.slice(1)],
    );
  });

  it("players bulk 3000 rows under 2s", () => {
    const rows = Array.from({ length: 3000 }, (_, i) => player(i));
    const t0 = performance.now();
    expect(upsertPlayers(h, rows, "t1").rowsChanged).toBe(3000);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(upsertPlayers(h, rows, "t2").rowsChanged).toBe(0);
    expect(tableCounts(h)["players"]).toBe(3000);
  });

  it("matchups", () => {
    const m = (id: number): Matchup => ({
      leagueId: "L1",
      week: 3,
      rosterId: id,
      matchupId: 1,
      starters: ["1", "0"],
      startersPoints: [1.5, 0],
      players: ["1"],
      playersPoints: { "1": 1.5 },
      points: 1.5,
    });
    checkIdempotent(
      [m(1), m(2)],
      (r) => upsertMatchups(h, r),
      (r) => [{ ...(r[0] as Matchup), points: 2, playersPoints: { "1": 2 } }, ...r.slice(1)],
    );
  });

  it("transactions", () => {
    const t = (id: string): Transaction => ({
      leagueId: "L1",
      transactionId: id,
      week: 1,
      type: "waiver",
      status: "complete",
      adds: { "1": 2 },
      drops: null,
      rosterIds: [2],
      waiverBid: 5,
      creator: "u1",
      createdAt: 1000,
      statusUpdatedAt: null,
      draftPicks: [],
      waiverBudget: [],
      consenterIds: null,
    });
    checkIdempotent(
      [t("a"), t("b")],
      (r) => upsertTransactions(h, r),
      (r) => [{ ...(r[0] as Transaction), status: "failed" }, ...r.slice(1)],
    );
  });

  it("playerWeekStats", () => {
    const s = (id: string) => ({
      season: 2025,
      seasonType: "regular" as const,
      week: 1,
      playerId: id,
      stats: { rec: 3 },
      source: "sleeper" as const,
    });
    checkIdempotent(
      [s("1"), s("2")],
      (r) => upsertPlayerWeekStats(h, r),
      (r) => [{ ...(r[0] as ReturnType<typeof s>), stats: { rec: 4 } }, ...r.slice(1)],
    );
  });

  it("playerWeekProjections ignores fetchedAt-only changes", () => {
    checkIdempotent(
      [proj("1", 1, "2025-09-01T00:00:00Z"), proj("2", 1, "2025-09-01T00:00:00Z")],
      (r) => upsertPlayerWeekProjections(h, r),
      (r) => [{ ...(r[0] as PlayerWeekProjection), stats: { pts_ppr: 12 } }, ...r.slice(1)],
    );
    expect(upsertPlayerWeekProjections(h, [proj("2", 1, "2025-09-02T00:00:00Z")]).rowsChanged).toBe(
      0,
    );
  });

  it("schedule", () => {
    const g = (id: string): ScheduleGame => ({
      season: 2025,
      week: 1,
      gameId: id,
      gameType: "REG",
      home: "KC",
      away: "DEN",
      kickoffUtc: "2025-09-07T17:00:00Z",
      kickoffApproximate: false,
      roof: null,
      spreadLine: -3,
      totalLine: null,
      homeScore: null,
      awayScore: null,
    });
    checkIdempotent(
      [g("a"), g("b")],
      (r) => upsertSchedule(h, r),
      (r) => [{ ...(r[0] as ScheduleGame), homeScore: 24, awayScore: 20 }, ...r.slice(1)],
    );
  });

  it("usageWeek", () => {
    const u = (id: string): UsageWeek => ({
      season: 2025,
      week: 1,
      playerId: id,
      team: "KC",
      snapPct: 0.8,
      targets: 5,
      targetShare: 0.2,
      airYardsShare: null,
      carries: null,
      carryShare: null,
      rzTouches: null,
    });
    checkIdempotent(
      [u("1"), u("2")],
      (r) => upsertUsageWeek(h, r),
      (r) => [{ ...(r[0] as UsageWeek), rzTouches: 1 }, ...r.slice(1)],
    );
  });

  it("nflState", () => {
    const st = {
      season: 2025,
      week: 3,
      seasonType: "regular" as const,
      displayWeek: 3,
      leg: 3,
      previousSeason: 2024,
      seasonStartDate: "2025-09-04",
    };
    checkIdempotent(
      [st],
      (r, s) => upsertNflState(h, r[0] as typeof st, s),
      ([x]) => [{ ...(x as typeof st), week: 4 }],
    );
    expect(tableCounts(h)["nfl_state"]).toBe(1);
  });

  it("empty input counts 0", () => {
    expect(upsertPlayers(h, [], "t").rowsChanged).toBe(0);
  });

  it("leaguePlayerWeekPoints", () => {
    const row = (id: string): UpsertLeaguePlayerWeekPointsRow => ({
      leagueId: "L1",
      season: 2025,
      week: 1,
      playerId: id,
      actualPts: null,
      projPts: 10.5,
    });
    checkIdempotent(
      [row("1"), row("2")],
      (r) => upsertLeaguePlayerWeekPoints(h, r),
      (r) => [{ ...(r[0] as UpsertLeaguePlayerWeekPointsRow), actualPts: 12.4 }, ...r.slice(1)],
    );
    const stored = h.sqlite
      .prepare(
        "SELECT actual_pts AS a, proj_pts AS p FROM league_player_week_points WHERE player_id = '1'",
      )
      .get() as { a: number; p: number | null };
    expect(stored.a).toBe(12.4);
    expect(stored.p).toBe(10.5);
    // null round-trips for a not-yet-scored row
    expect(
      upsertLeaguePlayerWeekPoints(h, [
        { leagueId: "L1", season: 2025, week: 2, playerId: "3", actualPts: null, projPts: null },
      ]).rowsChanged,
    ).toBe(1);
    const nullRow = h.sqlite
      .prepare(
        "SELECT actual_pts AS a, proj_pts AS p FROM league_player_week_points WHERE player_id = '3'",
      )
      .get() as { a: number | null; p: number | null };
    expect(nullRow.a).toBeNull();
    expect(nullRow.p).toBeNull();
  });

  it("defenseVsPosition", () => {
    const row = (position: string): UpsertDefenseVsPositionRow => ({
      leagueId: "L1",
      season: 2025,
      throughWeek: 3,
      team: "KC",
      position,
      ptsAllowedPg: 15.2,
      games: 3,
    });
    checkIdempotent(
      [row("RB"), row("WR")],
      (r) => upsertDefenseVsPosition(h, r),
      (r) => [{ ...(r[0] as UpsertDefenseVsPositionRow), ptsAllowedPg: 18.1 }, ...r.slice(1)],
    );
    expect(tableCounts(h)["defense_vs_position"]).toBe(2);
  });
});

describe("replaceTrending", () => {
  const e = (id: string, count: number, type: "add" | "drop" = "add") => ({
    playerId: id,
    type,
    count,
    lookbackHours: 24,
    fetchedAt: "x",
  });
  it("identical -> 0, changed -> counted, removed -> counted, other type untouched", () => {
    expect(replaceTrending(h, "add", [e("1", 5), e("2", 4)], "t1").rowsChanged).toBe(2);
    expect(replaceTrending(h, "drop", [e("9", 1, "drop")], "t1").rowsChanged).toBe(1);
    expect(replaceTrending(h, "add", [e("1", 5), e("2", 4)], "t2").rowsChanged).toBe(0);
    expect(replaceTrending(h, "add", [e("1", 6), e("2", 4)], "t3").rowsChanged).toBe(1);
    // drop 2, add 3
    expect(replaceTrending(h, "add", [e("1", 6), e("3", 1)], "t4").rowsChanged).toBe(2);
    expect(tableCounts(h)["trending"]).toBe(3);
  });
});

describe("upsertProjectionSnapshots", () => {
  const kick = "2025-09-07T17:00:00Z";
  const rows = (fetchedAt: string, pts = 10) => [proj("1", 1, fetchedAt, pts)];
  const get = (): { fetched_at: string; stats_json: string } =>
    h.sqlite
      .prepare("SELECT fetched_at, stats_json FROM player_week_projection_snapshots")
      .get() as {
      fetched_at: string;
      stats_json: string;
    };

  it("writes before kickoff, replaces older pre-kickoff, never after kickoff", () => {
    expect(upsertProjectionSnapshots(h, rows("2025-09-05T00:00:00Z"), () => kick)).toEqual({
      rowsChanged: 1,
      skipped: 0,
    });
    expect(
      upsertProjectionSnapshots(h, rows("2025-09-06T00:00:00Z", 12), () => kick).rowsChanged,
    ).toBe(1);
    expect(get().stats_json).toContain("12");
    // identical content, later fetch: no change
    expect(
      upsertProjectionSnapshots(h, rows("2025-09-06T12:00:00Z", 12), () => kick).rowsChanged,
    ).toBe(0);
    // older fetch does not overwrite
    expect(
      upsertProjectionSnapshots(h, rows("2025-09-01T00:00:00Z", 99), () => kick).rowsChanged,
    ).toBe(0);
    // at kickoff (strict) and after: ignored
    expect(upsertProjectionSnapshots(h, rows(kick, 50), () => kick).rowsChanged).toBe(0);
    expect(
      upsertProjectionSnapshots(h, rows("2025-09-08T00:00:00Z", 50), () => kick).rowsChanged,
    ).toBe(0);
    expect(get().fetched_at).toBe("2025-09-06T00:00:00Z");
  });

  it("skips and counts unknown kickoff", () => {
    expect(upsertProjectionSnapshots(h, rows("2025-09-05T00:00:00Z"), () => null)).toEqual({
      rowsChanged: 0,
      skipped: 1,
    });
    expect(tableCounts(h)["player_week_projection_snapshots"]).toBe(0);
  });
});

describe("cache and helpers", () => {
  it("etag store round trip and structural type", async () => {
    interface Shape {
      get(url: string): Promise<{ etag: string; body: unknown } | undefined>;
      set(url: string, etag: string, body: unknown): Promise<void>;
    }
    const store: DbEtagStore = createDbEtagStore(h, () => new Date("2025-01-01T00:00:00Z"));
    const asShape: Shape = store;
    expect(await asShape.get("u")).toBeUndefined();
    await asShape.set("u", 'W/"1"', { a: [1, 2] });
    expect(await asShape.get("u")).toEqual({ etag: 'W/"1"', body: { a: [1, 2] } });
    await asShape.set("u", 'W/"2"', null);
    expect(await asShape.get("u")).toEqual({ etag: 'W/"2"', body: null });
    h.sqlite.prepare("UPDATE http_cache SET body = '{bad'").run();
    expect(await asShape.get("u")).toBeUndefined();
  });

  it("computed cache get/put/invalidate", () => {
    const k = { leagueId: "L1", week: 3, kind: "waivers", inputsHash: "abc" };
    expect(getComputed(h, k)).toBeNull();
    putComputed(h, k, { x: 1 }, new Date("2025-01-01T00:00:00Z"));
    putComputed(h, k, { x: 2 }, new Date("2025-01-02T00:00:00Z"));
    putComputed(h, { ...k, week: 4 }, [1], new Date("2025-01-02T00:00:00Z"));
    putComputed(h, { ...k, leagueId: "L2" }, [1], new Date("2025-01-02T00:00:00Z"));
    expect(getComputed(h, k)).toEqual({ x: 2 });
    expect(invalidateComputed(h, { leagueId: "L1", week: 3 })).toBe(1);
    expect(getComputed(h, k)).toBeNull();
    expect(invalidateComputed(h, { leagueId: "L1" })).toBe(1);
    expect(invalidateComputed(h, { leagueId: "L1" })).toBe(0);
    expect(tableCounts(h)["computed_cache"]).toBe(1);
    h.sqlite.prepare("UPDATE computed_cache SET payload_json = '{bad'").run();
    expect(getComputed(h, { ...k, leagueId: "L2" })).toBeNull();
  });

  it("tableCounts and dbCheck", () => {
    const c = tableCounts(h);
    expect(c["leagues"]).toBe(0);
    expect(Object.keys(c)).not.toContain("__drizzle_migrations");
    expect(dbCheck(h)).toEqual({ ok: true });
    h.sqlite.close();
    const r = dbCheck(h);
    expect(r.ok).toBe(false);
    h = openDb(dbPathFromDataDir(dir)); // reopened so afterEach can close
  });
});
