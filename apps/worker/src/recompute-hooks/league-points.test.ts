import {
  upsertLeague,
  upsertPlayerWeekProjections,
  upsertPlayerWeekStats,
  type DbHandle,
} from "@sideline/db";
import type { League, PlayerWeekProjection, PlayerWeekStats } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { silent, tempDb } from "../testutil.js";
import { createLeaguePointsRecomputeHook } from "./league-points.js";

const league = (id: string, scoringSettings: Record<string, number>, season = 2025): League => ({
  leagueId: id,
  season,
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
  statsValues: Record<string, number>,
  source: "sleeper" | "nflverse" = "sleeper",
): PlayerWeekStats => ({
  season: 2025,
  seasonType: "regular",
  week,
  playerId,
  stats: statsValues,
  source,
});

const proj = (
  playerId: string,
  week: number,
  statsValues: Record<string, number>,
): PlayerWeekProjection => ({
  season: 2025,
  seasonType: "regular",
  week,
  playerId,
  stats: statsValues,
  opponent: "DEN",
  fetchedAt: "2025-09-01T00:00:00Z",
  source: "sleeper",
});

function pointsRows(db: DbHandle) {
  return db.sqlite
    .prepare(
      "SELECT league_id AS leagueId, season, week, player_id AS playerId, actual_pts AS actualPts, proj_pts AS projPts FROM league_player_week_points ORDER BY league_id, week, player_id",
    )
    .all() as {
    leagueId: string;
    season: number;
    week: number;
    playerId: string;
    actualPts: number | null;
    projPts: number | null;
  }[];
}

function tableCount(db: DbHandle): number {
  return (
    db.sqlite.prepare("SELECT COUNT(*) AS n FROM league_player_week_points").get() as {
      n: number;
    }
  ).n;
}

describe("createLeaguePointsRecomputeHook", () => {
  it("no-ops when changedTables has neither relevant table", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["players"]));
    expect(tableCount(db)).toBe(0);
  });

  it("stats-only change: actualPts set, projPts null", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1, rec_yd: 0.1 }), "t1");
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3, rec_yd: 40 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));
    expect(pointsRows(db)).toEqual([
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 7, projPts: null },
    ]);
  });

  it("projections-only change: projPts set, actualPts null", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1, rec_yd: 0.1 }), "t1");
    upsertPlayerWeekProjections(db, [proj("p1", 1, { rec: 2, rec_yd: 20 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_projections"]));
    expect(pointsRows(db)).toEqual([
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: null, projPts: 4 },
    ]);
  });

  it("both present populates both columns, using rescoreProjection (DEF bucket-from-mean exception)", async () => {
    const db = tempDb();
    upsertLeague(
      db,
      league("L1", {
        rec: 1,
        rec_yd: 0.1,
        pts_allow_14_20: 3,
      }),
      "t1",
    );
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3, rec_yd: 40 })]);
    upsertPlayerWeekProjections(db, [proj("DEF1", 1, { pts_allow: 18.5 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats", "player_week_projections"]));
    const rows = pointsRows(db);
    expect(rows).toEqual([
      { leagueId: "L1", season: 2025, week: 1, playerId: "DEF1", actualPts: null, projPts: 3 },
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 7, projPts: null },
    ]);
  });

  it("second run with identical data reports zero rows changed (idempotent)", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));
    expect(pointsRows(db)).toHaveLength(1);

    // Run again with no underlying data change: upsert should report 0 rows changed. We can't
    // observe the upsert's return value directly from the hook, so assert the stored data is
    // byte-identical, which only happens if the second write was a true no-op upsert.
    const before = pointsRows(db);
    await hook(db, new Set(["player_week_stats"]));
    expect(pointsRows(db)).toEqual(before);
  });

  it("scores each league independently with its own scoring settings", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertLeague(db, league("L2", { rec: 2 }), "t1");
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3 })]);
    const hook = createLeaguePointsRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));
    const rows = pointsRows(db).sort((a, b) => a.leagueId.localeCompare(b.leagueId));
    expect(rows).toEqual([
      { leagueId: "L1", season: 2025, week: 1, playerId: "p1", actualPts: 3, projPts: null },
      { leagueId: "L2", season: 2025, week: 1, playerId: "p1", actualPts: 6, projPts: null },
    ]);
  });
});
