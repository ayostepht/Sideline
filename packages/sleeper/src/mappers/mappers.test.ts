import { describe, expect, it } from "vitest";
import {
  LeagueSchema,
  MatchupSchema,
  PlayerSchema,
  PlayerWeekProjectionSchema,
  PlayerWeekStatsSchema,
  RosterSchema,
  TransactionSchema,
} from "@sideline/shared";
import {
  combineDecimal,
  mapLeague,
  mapLeagueUser,
  mapMatchup,
  mapPlayer,
  mapProjection,
  mapRoster,
  mapState,
  mapStats,
  mapTransaction,
} from "./index.js";

describe("T1.2b mappers: league and roster", () => {
  it("combines fpts and fpts_decimal without float drift", () => {
    expect(combineDecimal(366, 28)).toBe(366.28);
    expect(combineDecimal(10, 5)).toBe(10.05);
    expect(combineDecimal(undefined, undefined)).toBe(0);
  });

  it("maps FAAB, reverse standings and unknown waiver types", () => {
    const base = {
      league_id: "1",
      name: "n",
      status: "in_season",
      season: "2026",
      previous_league_id: "0",
      total_rosters: 12,
      scoring_settings: { rec: 0.5 },
      roster_positions: null,
    };
    const faab = mapLeague({
      ...base,
      settings: { waiver_type: 2, waiver_budget: 200, daily_waivers: 1, divisions: 2, note: "x" },
    });
    expect(LeagueSchema.parse(faab)).toBeTruthy();
    expect(faab).toMatchObject({
      waiverMode: "faab",
      waiverBudget: 200,
      dailyWaivers: true,
      divisions: 2,
      previousLeagueId: null,
      rosterPositions: [],
    });
    expect(faab.settings).not.toHaveProperty("note");
    expect(mapLeague({ ...base, settings: { waiver_type: 1 } }).waiverMode).toBe(
      "reverse_standings",
    );
    const unknown = mapLeague({ ...base, settings: { waiver_type: 9 } });
    expect(unknown.waiverMode).toBe("unknown");
    expect(mapLeague({ ...base, settings: {} }).waiverType).toBeNull();
  });

  it("maps roster nulls to empty arrays and tolerates missing settings", () => {
    const r = mapRoster({ roster_id: 3, reserve: null, taxi: null, players: null }, "L");
    expect(RosterSchema.parse(r)).toBeTruthy();
    expect(r).toMatchObject({
      players: [],
      reserve: [],
      ownerId: null,
      fpts: 0,
      waiverPosition: null,
    });
  });

  it("keeps the empty-slot marker 0 in starters", () => {
    const r = mapRoster({ roster_id: 1, starters: ["0", "12"] }, "L");
    expect(r.starters).toEqual(["0", "12"]);
  });

  it("state handles missing optional fields and previous season", () => {
    expect(
      mapState({ season: "2026", week: 2, season_type: "pre", previous_season: "2025" }),
    ).toEqual({
      season: 2026,
      week: 2,
      seasonType: "pre",
      displayWeek: 2,
      leg: 2,
      previousSeason: 2025,
      seasonStartDate: null,
    });
  });

  it("league users: blank team name becomes null", () => {
    expect(
      mapLeagueUser({ user_id: "u", display_name: "d", metadata: { team_name: "  " } }, "L")
        .teamName,
    ).toBeNull();
  });
});

describe("T1.2b mappers: matchups and transactions", () => {
  it("matchup maps null ids and null points to safe values", () => {
    const m = mapMatchup(
      {
        roster_id: 1,
        matchup_id: null,
        points: null,
        starters_points: [1.5, null],
        players_points: { a: null, b: 2 },
      },
      "L",
      7,
    );
    expect(MatchupSchema.parse(m)).toBeTruthy();
    expect(m).toMatchObject({
      matchupId: null,
      points: 0,
      startersPoints: [1.5, 0],
      playersPoints: { a: 0, b: 2 },
      week: 7,
    });
  });

  it("maps FAAB bid, trade picks, budget transfers and consenters", () => {
    const t = mapTransaction(
      {
        transaction_id: "t",
        type: "trade",
        status: "complete",
        leg: 6,
        created: 1,
        status_updated: 2,
        creator: "u",
        adds: { "1": 2 },
        drops: null,
        roster_ids: [1, 2],
        consenter_ids: [1, 2],
        settings: { waiver_bid: 44 },
        draft_picks: [{ season: "2027", round: 1 }],
        waiver_budget: [{ sender: 1, receiver: 2, amount: 10 }],
      },
      "L",
    );
    expect(TransactionSchema.parse(t)).toBeTruthy();
    expect(t).toMatchObject({
      waiverBid: 44,
      week: 6,
      draftPicks: [{ season: "2027", round: 1 }],
      waiverBudget: [{ sender: 1, receiver: 2, amount: 10 }],
      consenterIds: [1, 2],
      statusUpdatedAt: 2,
    });
  });

  it("minimal transaction defaults", () => {
    const t = mapTransaction(
      { transaction_id: "t", type: "free_agent", status: "failed", leg: 1, created: 5 },
      "L",
    );
    expect(t).toMatchObject({
      adds: null,
      rosterIds: [],
      waiverBid: null,
      creator: null,
      statusUpdatedAt: null,
      consenterIds: null,
      draftPicks: [],
      waiverBudget: [],
    });
  });
});

describe("T1.2b mappers: players, projections, stats", () => {
  it("trims gsis_id and maps empty to null (ADR-006 item 5)", () => {
    expect(mapPlayer({ player_id: "1", gsis_id: " 00-0023853" }).gsisId).toBe("00-0023853");
    expect(mapPlayer({ player_id: "1", gsis_id: "   " }).gsisId).toBeNull();
    expect(mapPlayer({ player_id: "1" }).gsisId).toBeNull();
  });

  it("normalizes espn_id from number or string, null when absent or empty", () => {
    expect(mapPlayer({ player_id: "1", espn_id: 3139477 }).espnId).toBe("3139477");
    expect(mapPlayer({ player_id: "1", espn_id: " 4430027 " }).espnId).toBe("4430027");
    expect(mapPlayer({ player_id: "1", espn_id: "  " }).espnId).toBeNull();
    expect(mapPlayer({ player_id: "1", espn_id: null }).espnId).toBeNull();
    expect(mapPlayer({ player_id: "1" }).espnId).toBeNull();
  });

  it("falls back to first plus last name, then id, for fullName", () => {
    expect(
      mapPlayer({ player_id: "ATL", first_name: "Atlanta", last_name: "Falcons" }).fullName,
    ).toBe("Atlanta Falcons");
    const bare = mapPlayer({ player_id: "9" });
    expect(PlayerSchema.parse(bare).fullName).toBe("9");
  });

  it("projection and stats mappers use the caller's context and keep numeric stats only", () => {
    const row = {
      player_id: "p",
      opponent: null,
      stats: { gp: 1, rec: 3.5, label: "x", bad: Number.NaN },
    };
    const ctx = { season: 2026, week: 5, seasonType: "regular" as const };
    const proj = mapProjection(row, { ...ctx, fetchedAt: "2026-10-02T00:00:00.000Z" });
    expect(PlayerWeekProjectionSchema.parse(proj)).toBeTruthy();
    expect(proj).toMatchObject({ stats: { gp: 1, rec: 3.5 }, opponent: null, source: "sleeper" });
    const stats = mapStats(row, ctx);
    expect(PlayerWeekStatsSchema.parse(stats).source).toBe("sleeper");
  });
});
