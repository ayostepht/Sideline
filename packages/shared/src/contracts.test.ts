import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  LeagueSchema,
  LeagueUserSchema,
  MatchupSchema,
  NflStateSchema,
  PlayerSchema,
  PlayerWeekProjectionSchema,
  PlayerWeekStatsSchema,
  ReasonSchema,
  RosterSchema,
  ScheduleGameSchema,
  SYNC_JOB_NAMES,
  SyncRequestSchema,
  SyncRunRequestBodySchema,
  SyncRunResponseSchema,
  SyncRunSchema,
  SyncStatusResponseSchema,
  TransactionSchema,
  TrendingEntrySchema,
  UsageWeekSchema,
  deriveWaiverMode,
} from "./index.js";

const iso = "2026-10-02T00:00:00.000Z";
const run = {
  id: 1,
  job: "state",
  startedAt: iso,
  finishedAt: null,
  status: "running",
  callsMade: 0,
  rowsChanged: 0,
  error: null,
};
const req = {
  id: 2,
  job: "all",
  requestedAt: iso,
  status: "pending",
  source: "api",
  startedAt: null,
  finishedAt: null,
  error: null,
};

const samples: [string, ZodType, unknown][] = [
  [
    "NflState",
    NflStateSchema,
    {
      season: 2026,
      week: 4,
      seasonType: "regular",
      displayWeek: 4,
      leg: 4,
      previousSeason: 2025,
      seasonStartDate: "2026-09-10",
    },
  ],
  [
    "League",
    LeagueSchema,
    {
      leagueId: "1",
      season: 2026,
      name: "L",
      status: "in_season",
      previousLeagueId: null,
      totalRosters: 10,
      rosterPositions: ["QB", "BN"],
      scoringSettings: { rec: 1 },
      playoffWeekStart: 15,
      playoffTeams: 6,
      tradeDeadline: 11,
      waiverType: 0,
      waiverMode: "rolling",
      waiverDayOfWeek: 2,
      waiverClearDays: 2,
      dailyWaivers: false,
      waiverBudget: 100,
      divisions: null,
      reserveSlots: 2,
      taxiSlots: 0,
      leagueAverageMatch: false,
      settings: { num_teams: 10 },
    },
  ],
  [
    "LeagueUser",
    LeagueUserSchema,
    { leagueId: "1", userId: "u", displayName: "<b>x</b>", teamName: null, avatar: null },
  ],
  [
    "Roster",
    RosterSchema,
    {
      leagueId: "1",
      rosterId: 1,
      ownerId: null,
      players: ["1"],
      starters: ["0", "1"],
      reserve: [],
      taxi: [],
      wins: 1,
      losses: 2,
      ties: 0,
      fpts: 366.28,
      fptsAgainst: 399.46,
      waiverPosition: 3,
      waiverBudgetUsed: 0,
    },
  ],
  [
    "Player",
    PlayerSchema,
    {
      playerId: "1",
      fullName: "A B",
      firstName: "A",
      lastName: "B",
      position: "WR",
      fantasyPositions: ["WR"],
      team: null,
      status: "Active",
      injuryStatus: null,
      injuryBodyPart: null,
      active: true,
      age: 25,
      yearsExp: 3,
      depthChartOrder: 1,
      searchRank: 10,
      gsisId: null,
    },
  ],
  [
    "Matchup",
    MatchupSchema,
    {
      leagueId: "1",
      week: 1,
      rosterId: 1,
      matchupId: null,
      starters: ["1"],
      startersPoints: [1.5],
      players: ["1"],
      playersPoints: { "1": 1.5 },
      points: 1.5,
    },
  ],
  [
    "Transaction",
    TransactionSchema,
    {
      leagueId: "1",
      transactionId: "t",
      week: 1,
      type: "waiver",
      status: "future_status",
      adds: { "1": 2 },
      drops: null,
      rosterIds: [2],
      waiverBid: null,
      creator: "u",
      createdAt: 1700000000000,
      statusUpdatedAt: null,
      draftPicks: [{ season: "2027", round: 1 }],
      waiverBudget: [{ sender: 1, receiver: 2, amount: 10 }],
      consenterIds: [1, 2],
    },
  ],
  [
    "Transaction (unknown type, nullable consenters)",
    TransactionSchema,
    {
      leagueId: "1",
      transactionId: "t2",
      week: 1,
      type: "future_type",
      status: "complete",
      adds: null,
      drops: null,
      rosterIds: [],
      waiverBid: null,
      creator: null,
      createdAt: 1700000000000,
      statusUpdatedAt: null,
      draftPicks: [],
      waiverBudget: [],
      consenterIds: null,
    },
  ],
  [
    "PlayerWeekStats",
    PlayerWeekStatsSchema,
    {
      season: 2026,
      week: 1,
      seasonType: "regular",
      playerId: "1",
      stats: { rec: 3 },
      source: "nflverse",
    },
  ],
  [
    "PlayerWeekProjection",
    PlayerWeekProjectionSchema,
    {
      season: 2026,
      week: 1,
      seasonType: "regular",
      playerId: "1",
      stats: { rec: 3 },
      opponent: null,
      fetchedAt: iso,
      source: "sleeper",
    },
  ],
  [
    "ScheduleGame",
    ScheduleGameSchema,
    {
      season: 2026,
      week: 1,
      gameId: "g",
      gameType: "REG",
      home: "KC",
      away: "BUF",
      kickoffUtc: null,
      kickoffApproximate: true,
      roof: null,
      spreadLine: -3.5,
      totalLine: null,
      homeScore: null,
      awayScore: null,
    },
  ],
  [
    "UsageWeek",
    UsageWeekSchema,
    {
      season: 2026,
      week: 1,
      playerId: "1",
      team: "KC",
      snapPct: 0.8,
      targets: null,
      targetShare: null,
      airYardsShare: null,
      carries: null,
      carryShare: null,
      rzTouches: null,
    },
  ],
  [
    "TrendingEntry",
    TrendingEntrySchema,
    { playerId: "1", type: "add", count: 5, lookbackHours: 24, fetchedAt: iso },
  ],
  ["SyncRun", SyncRunSchema, run],
  ["SyncRequest", SyncRequestSchema, req],
  [
    "SyncStatusResponse",
    SyncStatusResponseSchema,
    { jobs: [{ job: "state", lastRun: run, lastSuccessAt: null, stale: true }], pending: [req] },
  ],
  ["SyncRunResponse", SyncRunResponseSchema, { request: req, deduplicated: false }],
  ["Reason", ReasonSchema, { code: "matchup", label: "Soft matchup", value: "DEN", impact: 1.2 }],
];

describe("contracts round-trip", () => {
  it.each(samples)("%s parses its own JSON and rejects unknown keys", (_name, schema, sample) => {
    expect(schema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
    expect(schema.safeParse({ ...(sample as object), bogus: 1 }).success).toBe(false);
  });
});

describe("Transaction defaults", () => {
  it("defaults draftPicks and waiverBudget to []", () => {
    const t = TransactionSchema.parse({
      leagueId: "1",
      transactionId: "t",
      week: 1,
      type: "waiver",
      status: "complete",
      adds: null,
      drops: null,
      rosterIds: [1],
      waiverBid: null,
      creator: null,
      createdAt: 1,
      statusUpdatedAt: null,
      consenterIds: null,
    });
    expect(t.draftPicks).toEqual([]);
    expect(t.waiverBudget).toEqual([]);
  });
  it("rejects an empty type", () => {
    expect(() => TransactionSchema.parse({ type: "" })).toThrow();
  });
});

describe("sync and waiver helpers", () => {
  it("lists all job names", () => {
    expect(SYNC_JOB_NAMES).toHaveLength(15);
  });
  it("SyncRunRequestBody defaults job to all", () => {
    expect(SyncRunRequestBodySchema.parse({})).toEqual({ job: "all" });
    expect(SyncRunRequestBodySchema.safeParse({ job: "nope" }).success).toBe(false);
  });
  it("deriveWaiverMode maps codes", () => {
    expect([0, 1, 2, 9, null, undefined].map(deriveWaiverMode)).toEqual([
      "rolling",
      "reverse_standings",
      "faab",
      "unknown",
      "unknown",
      "unknown",
    ]);
  });
});
