import {
  upsertLeague,
  upsertPlayers,
  upsertPlayerWeekStats,
  upsertSchedule,
  type DbHandle,
} from "@sideline/db";
import type { League, Player, PlayerWeekStats, ScheduleGame } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { silent, tempDb } from "../testutil.js";
import { createDefenseVsPositionRecomputeHook } from "./defense-vs-position.js";

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

const player = (playerId: string, team: string | null, position: string | null): Player => ({
  playerId,
  fullName: "Name",
  firstName: null,
  lastName: null,
  position,
  fantasyPositions: [],
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

const stats = (
  playerId: string,
  week: number,
  statsValues: Record<string, number>,
  season = 2025,
): PlayerWeekStats => ({
  season,
  seasonType: "regular",
  week,
  playerId,
  stats: statsValues,
  source: "sleeper",
});

function dvpRows(db: DbHandle) {
  return db.sqlite
    .prepare(
      "SELECT league_id AS leagueId, season, through_week AS throughWeek, team, position, pts_allowed_pg AS ptsAllowedPg, games FROM defense_vs_position ORDER BY league_id, through_week, team, position",
    )
    .all() as {
    leagueId: string;
    season: number;
    throughWeek: number;
    team: string;
    position: string;
    ptsAllowedPg: number;
    games: number;
  }[];
}

function tableCount(db: DbHandle): number {
  return (db.sqlite.prepare("SELECT COUNT(*) AS n FROM defense_vs_position").get() as { n: number })
    .n;
}

describe("createDefenseVsPositionRecomputeHook", () => {
  it("no-ops when changedTables has neither relevant table", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(db, [player("p1", "KC", "RB")], "2025-09-01T00:00:00Z");
    upsertSchedule(db, [game(2025, 1, "g1", "KC", "DEN")]);
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3 })]);
    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    await hook(db, new Set(["players"]));
    expect(tableCount(db)).toBe(0);
  });

  it("one week, two teams: produces the shrunk ptsAllowedPg for both teams at RB", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(
      db,
      [player("kc_rb", "KC", "RB"), player("den_rb", "DEN", "RB")],
      "2025-09-01T00:00:00Z",
    );
    upsertSchedule(db, [game(2025, 1, "g1", "KC", "DEN")]);
    upsertPlayerWeekStats(db, [stats("kc_rb", 1, { rec: 5 }), stats("den_rb", 1, { rec: 3 })]);

    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));

    // leaguePositionAverage(RB) through week 1 = avg([5, 3]) = 4.
    // DEN allowed KC's RB 5 pts: n=1, rawAvg=5 (single week, weight cancels), w=1/(1+4)=0.2
    //   ptsAllowedPg = 0.2*5 + 0.8*4 = 4.2
    // KC allowed DEN's RB 3 pts: rawAvg=3, ptsAllowedPg = 0.2*3 + 0.8*4 = 3.8
    const rows = dvpRows(db);
    expect(rows).toHaveLength(2);
    const den = rows.find((r) => r.team === "DEN");
    const kc = rows.find((r) => r.team === "KC");
    expect(den).toMatchObject({
      leagueId: "L1",
      season: 2025,
      throughWeek: 1,
      position: "RB",
      games: 1,
    });
    expect(den?.ptsAllowedPg).toBeCloseTo(4.2, 10);
    expect(kc).toMatchObject({
      leagueId: "L1",
      season: 2025,
      throughWeek: 1,
      position: "RB",
      games: 1,
    });
    expect(kc?.ptsAllowedPg).toBeCloseTo(3.8, 10);
  });

  it("second week accumulates: the week-2 snapshot includes both weeks, not week 2 alone", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(
      db,
      [player("kc_rb", "KC", "RB"), player("den_rb", "DEN", "RB")],
      "2025-09-01T00:00:00Z",
    );
    upsertSchedule(db, [game(2025, 1, "g1", "KC", "DEN"), game(2025, 2, "g2", "KC", "DEN")]);
    upsertPlayerWeekStats(db, [
      stats("kc_rb", 1, { rec: 5 }),
      stats("den_rb", 1, { rec: 3 }),
      stats("kc_rb", 2, { rec: 7 }),
      stats("den_rb", 2, { rec: 1 }),
    ]);

    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));

    // Through week 2: positionTotals(RB) = [5,3,7,1], avg = 16/4 = 4.
    // DEN allowed KC's RB: weeks [5,7], both "recent" (n<=4), rawAvg = (2*5+2*7)/4 = 6
    //   w = 2/(2+4) = 1/3, ptsAllowedPg = 1/3*6 + 2/3*4 = 2 + 8/3 = 4.666666...
    // KC allowed DEN's RB: weeks [3,1], rawAvg = (2*3+2*1)/4 = 2
    //   ptsAllowedPg = 1/3*2 + 2/3*4 = 2/3 + 8/3 = 3.333333...
    const rows = dvpRows(db).filter((r) => r.throughWeek === 2);
    expect(rows).toHaveLength(2);
    const den = rows.find((r) => r.team === "DEN");
    const kc = rows.find((r) => r.team === "KC");
    expect(den?.games).toBe(2);
    expect(den?.ptsAllowedPg).toBeCloseTo(14 / 3, 10);
    expect(kc?.games).toBe(2);
    expect(kc?.ptsAllowedPg).toBeCloseTo(10 / 3, 10);

    // The week-1 snapshot is untouched by week 2's data.
    const week1 = dvpRows(db).filter((r) => r.throughWeek === 1);
    expect(week1.find((r) => r.team === "DEN")?.games).toBe(1);
  });

  it("converts the player's Sleeper team code LAR to the schedule's LA before matching", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(db, [player("lar_wr", "LAR", "WR")], "2025-09-01T00:00:00Z");
    upsertSchedule(db, [game(2025, 1, "g1", "LA", "SEA")]);
    upsertPlayerWeekStats(db, [stats("lar_wr", 1, { rec: 4 })]);

    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));

    // LAR's WR (home, matched to schedule's "LA") scored 4 pts, allowed by the away team SEA.
    // n=1, leaguePositionAverage(WR) = avg([4]) = 4 (the only data point), so rawAvg === avgPos
    // and the shrinkage is a no-op: ptsAllowedPg = 0.2*4 + 0.8*4 = 4.
    const rows = dvpRows(db);
    expect(rows).toEqual([
      {
        leagueId: "L1",
        season: 2025,
        throughWeek: 1,
        team: "SEA",
        position: "WR",
        ptsAllowedPg: 4,
        games: 1,
      },
    ]);
  });

  it("a league with no schedule rows produces zero rows and does not throw", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(db, [player("p1", "KC", "RB")], "2025-09-01T00:00:00Z");
    upsertPlayerWeekStats(db, [stats("p1", 1, { rec: 3 })]);

    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    // Should not throw even though there is no schedule for this league/season.
    await hook(db, new Set(["player_week_stats"]));
    expect(tableCount(db)).toBe(0);
  });

  it("second run with identical data reports zero rows changed (idempotent)", async () => {
    const db = tempDb();
    upsertLeague(db, league("L1", { rec: 1 }), "t1");
    upsertPlayers(
      db,
      [player("kc_rb", "KC", "RB"), player("den_rb", "DEN", "RB")],
      "2025-09-01T00:00:00Z",
    );
    upsertSchedule(db, [game(2025, 1, "g1", "KC", "DEN")]);
    upsertPlayerWeekStats(db, [stats("kc_rb", 1, { rec: 5 }), stats("den_rb", 1, { rec: 3 })]);

    const hook = createDefenseVsPositionRecomputeHook({ logger: silent });
    await hook(db, new Set(["player_week_stats"]));
    const before = dvpRows(db);
    expect(before.length).toBeGreaterThan(0);

    await hook(db, new Set(["player_week_stats"]));
    expect(dvpRows(db)).toEqual(before);
  });
});
