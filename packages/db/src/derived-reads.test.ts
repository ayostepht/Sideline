import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  League,
  Player,
  PlayerWeekProjection,
  PlayerWeekStats,
  Roster,
  ScheduleGame,
  TrendingEntry,
  UsageWeek,
} from "@sideline/shared";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "./connection.js";
import {
  replaceTrending,
  upsertLeague,
  upsertLeaguePlayerWeekPoints,
  upsertPlayers,
  upsertPlayerWeekProjections,
  upsertPlayerWeekStats,
  upsertRosters,
  upsertSchedule,
  upsertUsageWeek,
} from "./upserts.js";
import {
  readLeaguePlayerWeekPoints,
  readLeagues,
  readLeagueWeekPositionRanks,
  readPlayers,
  readPlayersTeamPosition,
  readPlayerWeekProjections,
  readPlayerWeekStats,
  readRosteredPlayerIds,
  readSchedule,
  readTrending,
  readUsageWeek,
} from "./derived-reads.js";

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-derived-reads-"));
  h = openDb(dbPathFromDataDir(dir));
  migrate(h);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const league = (id: string, scoringSettings: Record<string, number>): League => ({
  leagueId: id,
  season: 2025,
  name: "L",
  status: "in_season",
  previousLeagueId: null,
  totalRosters: 10,
  rosterPositions: ["QB", "RB"],
  scoringSettings,
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
});

const stats = (
  playerId: string,
  week: number,
  source: "sleeper" | "nflverse",
): PlayerWeekStats => ({
  season: 2025,
  seasonType: "regular",
  week,
  playerId,
  stats: { rec: 3, rec_yd: 40 },
  source,
});

const proj = (playerId: string, week: number): PlayerWeekProjection => ({
  season: 2025,
  seasonType: "regular",
  week,
  playerId,
  stats: { pass_td: 2 },
  opponent: "DEN",
  fetchedAt: "2025-09-01T00:00:00Z",
  source: "sleeper",
});

const player = (
  playerId: string,
  team: string | null,
  position: string | null,
  fantasyPositions: string[] = [],
): Player => ({
  playerId,
  fullName: "Name",
  firstName: null,
  lastName: null,
  position,
  fantasyPositions,
  team,
  status: null,
  injuryStatus: null,
  injuryBodyPart: null,
  active: null,
  age: null,
  yearsExp: null,
  depthChartOrder: null,
  searchRank: null,
  gsisId: null,
});

const game = (
  season: number,
  week: number,
  gameId: string,
  home: string,
  away: string,
): ScheduleGame => ({
  season,
  week,
  gameId,
  gameType: "REG",
  home,
  away,
  kickoffUtc: null,
  kickoffApproximate: false,
  roof: null,
  spreadLine: null,
  totalLine: null,
  homeScore: null,
  awayScore: null,
});

const usage = (playerId: string, week: number, overrides: Partial<UsageWeek> = {}): UsageWeek => ({
  season: 2025,
  week,
  playerId,
  team: "KC",
  snapPct: 0.8,
  targets: 5,
  targetShare: 0.2,
  airYardsShare: null,
  carries: null,
  carryShare: null,
  rzTouches: null,
  ...overrides,
});

const trendingEntry = (playerId: string, lookbackHours = 24): TrendingEntry => ({
  playerId,
  type: "add",
  count: 10,
  lookbackHours,
  fetchedAt: "2025-09-01T00:00:00.000Z",
});

const roster = (rosterId: number, overrides: Partial<Roster> = {}): Roster => ({
  leagueId: "L1",
  rosterId,
  ownerId: "u1",
  players: [],
  starters: [],
  reserve: [],
  taxi: [],
  wins: 0,
  losses: 0,
  ties: 0,
  fpts: 0,
  fptsAgainst: 0,
  waiverPosition: null,
  waiverBudgetUsed: 0,
  ...overrides,
});

describe("readLeagues", () => {
  it("returns [] for an empty table", () => {
    expect(readLeagues(h)).toEqual([]);
  });

  it("returns every league with parsed scoring settings", () => {
    upsertLeague(h, league("L1", { rec: 1, pass_td: 4 }), "t1");
    upsertLeague(h, league("L2", { rec: 0.5 }), "t1");
    const rows = readLeagues(h).sort((a, b) => a.leagueId.localeCompare(b.leagueId));
    expect(rows).toEqual([
      { leagueId: "L1", season: 2025, scoringSettings: { rec: 1, pass_td: 4 } },
      { leagueId: "L2", season: 2025, scoringSettings: { rec: 0.5 } },
    ]);
  });

  it("throws naming the league id on corrupt scoring_json", () => {
    upsertLeague(h, league("L1", { rec: 1 }), "t1");
    h.sqlite
      .prepare("UPDATE leagues SET scoring_json = ? WHERE league_id = 'L1'")
      .run('{"rec":"bad"}');
    expect(() => readLeagues(h)).toThrow(/L1/);
  });
});

describe("readPlayerWeekStats", () => {
  it("returns [] when nothing stored", () => {
    expect(readPlayerWeekStats(h, 2025, "regular")).toEqual([]);
  });

  it("returns every row across weeks and sources with parsed stats", () => {
    upsertPlayerWeekStats(h, [
      stats("p1", 1, "sleeper"),
      stats("p1", 1, "nflverse"),
      stats("p2", 2, "sleeper"),
    ]);
    const rows = readPlayerWeekStats(h, 2025, "regular").sort(
      (a, b) => a.playerId.localeCompare(b.playerId) || a.source.localeCompare(b.source),
    );
    expect(rows).toEqual([
      { week: 1, playerId: "p1", stats: { rec: 3, rec_yd: 40 }, source: "nflverse" },
      { week: 1, playerId: "p1", stats: { rec: 3, rec_yd: 40 }, source: "sleeper" },
      { week: 2, playerId: "p2", stats: { rec: 3, rec_yd: 40 }, source: "sleeper" },
    ]);
  });

  it("excludes other seasons and season types", () => {
    upsertPlayerWeekStats(h, [stats("p1", 1, "sleeper")]);
    expect(readPlayerWeekStats(h, 2024, "regular")).toEqual([]);
    expect(readPlayerWeekStats(h, 2025, "post")).toEqual([]);
  });

  it("throws on corrupt stats_json", () => {
    upsertPlayerWeekStats(h, [stats("p1", 1, "sleeper")]);
    h.sqlite
      .prepare("UPDATE player_week_stats SET stats_json = ? WHERE player_id = 'p1'")
      .run("not json");
    expect(() => readPlayerWeekStats(h, 2025, "regular")).toThrow(/p1/);
  });
});

describe("readPlayerWeekProjections", () => {
  it("returns [] when nothing stored", () => {
    expect(readPlayerWeekProjections(h, 2025, "regular")).toEqual([]);
  });

  it("returns week, player, and stats only", () => {
    upsertPlayerWeekProjections(h, [proj("p1", 1), proj("p2", 2)]);
    const rows = readPlayerWeekProjections(h, 2025, "regular").sort((a, b) =>
      a.playerId.localeCompare(b.playerId),
    );
    expect(rows).toEqual([
      { week: 1, playerId: "p1", stats: { pass_td: 2 } },
      { week: 2, playerId: "p2", stats: { pass_td: 2 } },
    ]);
  });

  it("throws on corrupt stats_json", () => {
    upsertPlayerWeekProjections(h, [proj("p1", 1)]);
    h.sqlite
      .prepare("UPDATE player_week_projections SET stats_json = ? WHERE player_id = 'p1'")
      .run('{"a":{"nested":1}}');
    expect(() => readPlayerWeekProjections(h, 2025, "regular")).toThrow(/p1/);
  });
});

describe("readPlayersTeamPosition", () => {
  it("returns [] for an empty table", () => {
    expect(readPlayersTeamPosition(h)).toEqual([]);
  });

  it("returns every player projected to id, team, and position", () => {
    upsertPlayers(h, [player("p1", "KC", "QB"), player("p2", "BUF", "WR")], "2025-09-01T00:00:00Z");
    const rows = readPlayersTeamPosition(h).sort((a, b) => a.playerId.localeCompare(b.playerId));
    expect(rows).toEqual([
      { playerId: "p1", team: "KC", position: "QB" },
      { playerId: "p2", team: "BUF", position: "WR" },
    ]);
  });

  it("round-trips null team and position as null", () => {
    upsertPlayers(h, [player("p1", null, null)], "2025-09-01T00:00:00Z");
    const rows = readPlayersTeamPosition(h);
    expect(rows).toEqual([{ playerId: "p1", team: null, position: null }]);
    expect(rows[0]?.team).toBeNull();
    expect(rows[0]?.position).toBeNull();
  });
});

describe("readSchedule", () => {
  it("returns [] for an empty table", () => {
    expect(readSchedule(h, 2025)).toEqual([]);
  });

  it("returns every game for the season projected to week, home, and away", () => {
    upsertSchedule(h, [game(2025, 1, "g1", "KC", "BUF"), game(2025, 2, "g2", "SF", "DAL")]);
    const rows = readSchedule(h, 2025).sort((a, b) => a.week - b.week);
    expect(rows).toEqual([
      { week: 1, home: "KC", away: "BUF" },
      { week: 2, home: "SF", away: "DAL" },
    ]);
  });

  it("excludes other seasons", () => {
    upsertSchedule(h, [game(2024, 1, "g1", "KC", "BUF"), game(2025, 1, "g2", "SF", "DAL")]);
    expect(readSchedule(h, 2024)).toEqual([{ week: 1, home: "KC", away: "BUF" }]);
    expect(readSchedule(h, 2025)).toEqual([{ week: 1, home: "SF", away: "DAL" }]);
  });
});

describe("readLeaguePlayerWeekPoints", () => {
  it("returns [] for an empty table", () => {
    expect(readLeaguePlayerWeekPoints(h, "L1", 2025)).toEqual([]);
  });

  it("returns every row for the league and season projected to week, player, actualPts", () => {
    upsertLeaguePlayerWeekPoints(h, [
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 12.5, projPts: 10 },
      { leagueId: "L1", season: 2025, week: 2, playerId: "p2", actualPts: 5, projPts: null },
    ]);
    const rows = readLeaguePlayerWeekPoints(h, "L1", 2025).sort((a, b) => a.week - b.week);
    expect(rows).toEqual([
      { week: 1, playerId: "p1", actualPts: 12.5 },
      { week: 2, playerId: "p2", actualPts: 5 },
    ]);
  });

  it("excludes other leagues and seasons, and round-trips null actualPts as null", () => {
    upsertLeaguePlayerWeekPoints(h, [
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: null, projPts: 10 },
      { leagueId: "L2", season: 2025, week: 1, playerId: "p1", actualPts: 9, projPts: 10 },
      { leagueId: "L1", season: 2024, week: 1, playerId: "p1", actualPts: 8, projPts: 10 },
    ]);
    const rows = readLeaguePlayerWeekPoints(h, "L1", 2025);
    expect(rows).toEqual([{ week: 1, playerId: "p1", actualPts: null }]);
    expect(rows[0]?.actualPts).toBeNull();
  });
});

describe("readUsageWeek", () => {
  it("returns [] when nothing matches the season/week", () => {
    expect(readUsageWeek(h, 2025, 1)).toEqual([]);
  });

  it("returns every player's usage for the exact season/week, excluding other weeks", () => {
    upsertUsageWeek(h, [usage("p1", 1), usage("p2", 1, { team: "BUF" }), usage("p1", 2)]);
    const rows = readUsageWeek(h, 2025, 1).sort((a, b) => a.playerId.localeCompare(b.playerId));
    expect(rows).toEqual([
      {
        season: 2025,
        week: 1,
        playerId: "p1",
        team: "KC",
        snapPct: 0.8,
        targets: 5,
        targetShare: 0.2,
        airYardsShare: null,
        carries: null,
        carryShare: null,
        rzTouches: null,
      },
      {
        season: 2025,
        week: 1,
        playerId: "p2",
        team: "BUF",
        snapPct: 0.8,
        targets: 5,
        targetShare: 0.2,
        airYardsShare: null,
        carries: null,
        carryShare: null,
        rzTouches: null,
      },
    ]);
  });
});

describe("readTrending", () => {
  it("returns [] for an empty table", () => {
    expect(readTrending(h)).toEqual([]);
  });

  it("returns every current row with no filter", () => {
    replaceTrending(
      h,
      "add",
      [trendingEntry("p1", 24), trendingEntry("p2", 168)],
      "2025-09-01T00:00:00.000Z",
    );
    const rows = readTrending(h).sort((a, b) => a.playerId.localeCompare(b.playerId));
    expect(rows).toEqual([
      {
        playerId: "p1",
        type: "add",
        count: 10,
        lookbackHours: 24,
        fetchedAt: "2025-09-01T00:00:00.000Z",
      },
      {
        playerId: "p2",
        type: "add",
        count: 10,
        lookbackHours: 168,
        fetchedAt: "2025-09-01T00:00:00.000Z",
      },
    ]);
  });

  it("filters by lookbackHours and by type", () => {
    replaceTrending(
      h,
      "add",
      [trendingEntry("p1", 24), trendingEntry("p2", 168)],
      "2025-09-01T00:00:00.000Z",
    );
    replaceTrending(h, "drop", [trendingEntry("p3", 24)], "2025-09-01T00:00:00.000Z");
    expect(
      readTrending(h, { lookbackHours: 24 })
        .map((r) => r.playerId)
        .sort(),
    ).toEqual(["p1", "p3"]);
    expect(readTrending(h, { type: "drop" }).map((r) => r.playerId)).toEqual(["p3"]);
    expect(readTrending(h, { type: "add", lookbackHours: 168 }).map((r) => r.playerId)).toEqual([
      "p2",
    ]);
  });

  it("reflects replaceTrending's delete-then-upsert: a second sync with a smaller set drops the missing player", () => {
    replaceTrending(
      h,
      "add",
      [trendingEntry("p1", 24), trendingEntry("p2", 24)],
      "2025-09-01T00:00:00.000Z",
    );
    replaceTrending(h, "add", [trendingEntry("p2", 24)], "2025-09-02T00:00:00.000Z");
    expect(readTrending(h).map((r) => r.playerId)).toEqual(["p2"]);
  });
});

describe("readLeagueWeekPositionRanks", () => {
  it("returns [] when nothing scored that week", () => {
    expect(readLeagueWeekPositionRanks(h, "L1", 2025, 1)).toEqual([]);
  });

  it("ranks within each position independently, best score first", () => {
    upsertPlayers(
      h,
      [player("p1", "KC", "RB"), player("p2", "BUF", "RB"), player("p3", "SF", "WR")],
      "2025-09-01T00:00:00Z",
    );
    upsertLeaguePlayerWeekPoints(h, [
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 10, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p2", actualPts: 20, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p3", actualPts: 5, projPts: null },
    ]);
    const rows = readLeagueWeekPositionRanks(h, "L1", 2025, 1).sort((a, b) =>
      a.playerId.localeCompare(b.playerId),
    );
    expect(rows).toEqual([
      { playerId: "p1", position: "RB", actualPts: 10, rank: 2 },
      { playerId: "p2", position: "RB", actualPts: 20, rank: 1 },
      { playerId: "p3", position: "WR", actualPts: 5, rank: 1 },
    ]);
  });

  it("gives tied scores the same rank, skipping the next rank (standard competition ranking)", () => {
    upsertPlayers(
      h,
      [player("p1", "KC", "RB"), player("p2", "BUF", "RB"), player("p3", "SF", "RB")],
      "2025-09-01T00:00:00Z",
    );
    upsertLeaguePlayerWeekPoints(h, [
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 15, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p2", actualPts: 15, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p3", actualPts: 10, projPts: null },
    ]);
    const rows = readLeagueWeekPositionRanks(h, "L1", 2025, 1).sort((a, b) =>
      a.playerId.localeCompare(b.playerId),
    );
    expect(rows).toEqual([
      { playerId: "p1", position: "RB", actualPts: 15, rank: 1 },
      { playerId: "p2", position: "RB", actualPts: 15, rank: 1 },
      { playerId: "p3", position: "RB", actualPts: 10, rank: 3 },
    ]);
  });

  it("excludes other weeks, players with null actualPts, and players with no known position", () => {
    upsertPlayers(h, [player("p1", "KC", "RB"), player("p2", null, null)], "2025-09-01T00:00:00Z");
    upsertLeaguePlayerWeekPoints(h, [
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 10, projPts: null },
      { leagueId: "L1", season: 2025, week: 2, playerId: "p1", actualPts: 99, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p2", actualPts: 50, projPts: null },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p3", actualPts: null, projPts: null },
    ]);
    expect(readLeagueWeekPositionRanks(h, "L1", 2025, 1)).toEqual([
      { playerId: "p1", position: "RB", actualPts: 10, rank: 1 },
    ]);
  });
});

describe("readPlayers", () => {
  it("returns [] for an empty ids array without querying", () => {
    expect(readPlayers(h, [])).toEqual([]);
  });

  it("returns every player when ids is omitted", () => {
    upsertPlayers(h, [player("p1", "KC", "QB"), player("p2", "BUF", "WR")], "2025-09-01T00:00:00Z");
    const rows = readPlayers(h).sort((a, b) => a.playerId.localeCompare(b.playerId));
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
  });

  it("filters to the requested ids and decodes fantasy_positions_json", () => {
    upsertPlayers(
      h,
      [player("p1", "KC", "QB", ["QB", "SUPER_FLEX"]), player("p2", "BUF", "WR")],
      "2025-09-01T00:00:00Z",
    );
    const rows = readPlayers(h, ["p1"]);
    expect(rows).toEqual([
      {
        playerId: "p1",
        fullName: "Name",
        position: "QB",
        fantasyPositions: ["QB", "SUPER_FLEX"],
        team: "KC",
        status: null,
        injuryStatus: null,
      },
    ]);
  });

  it("round-trips null status and injury_status as null", () => {
    upsertPlayers(h, [player("p1", null, null)], "2025-09-01T00:00:00Z");
    const rows = readPlayers(h, ["p1"]);
    expect(rows).toEqual([
      {
        playerId: "p1",
        fullName: "Name",
        position: null,
        fantasyPositions: [],
        team: null,
        status: null,
        injuryStatus: null,
      },
    ]);
    expect(rows[0]?.status).toBeNull();
    expect(rows[0]?.injuryStatus).toBeNull();
  });
});

describe("readRosteredPlayerIds", () => {
  it("returns an empty set when the league has no rosters", () => {
    expect(readRosteredPlayerIds(h, "L1")).toEqual(new Set());
  });

  it("unions players, reserve, and taxi across every roster with no duplicates", () => {
    upsertRosters(
      h,
      [
        roster(1, { players: ["p1", "p2"], reserve: ["p2"], taxi: [] }),
        roster(2, { players: ["p3"], reserve: [], taxi: ["p4"] }),
      ],
      "2025-09-01T00:00:00Z",
    );
    const ids = readRosteredPlayerIds(h, "L1");
    expect(ids).toEqual(new Set(["p1", "p2", "p3", "p4"]));
  });

  it("excludes Sleeper's empty-slot placeholder \"0\" and other leagues' rosters", () => {
    upsertRosters(
      h,
      [
        roster(1, { players: ["p1"], starters: ["p1", "0"] }),
        roster(1, { leagueId: "L2", players: ["p9"] }),
      ],
      "2025-09-01T00:00:00Z",
    );
    expect(readRosteredPlayerIds(h, "L1")).toEqual(new Set(["p1"]));
    expect(readRosteredPlayerIds(h, "L2")).toEqual(new Set(["p9"]));
  });
});
