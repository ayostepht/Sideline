import { getTableColumns, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  LeagueSchema,
  LeagueUserSchema,
  MatchupSchema,
  NflStateSchema,
  PlayerSchema,
  PlayerWeekProjectionSchema,
  PlayerWeekStatsSchema,
  RosterSchema,
  ScheduleGameSchema,
  TransactionSchema,
  TrendingEntrySchema,
  UsageWeekSchema,
} from "@sideline/shared";
import * as s from "./schema.js";

/** Domain key -> table property name. Identity unless listed (JSON-backed arrays/records). */
const cases: Array<[string, z.ZodObject<z.ZodRawShape>, Table, Record<string, string>]> = [
  [
    "League",
    LeagueSchema,
    s.leagues,
    {
      rosterPositions: "rosterPositionsJson",
      scoringSettings: "scoringJson",
      settings: "settingsJson",
    },
  ],
  ["LeagueUser", LeagueUserSchema, s.leagueUsers, {}],
  [
    "Roster",
    RosterSchema,
    s.rosters,
    { players: "playersJson", starters: "startersJson", reserve: "reserveJson", taxi: "taxiJson" },
  ],
  ["Player", PlayerSchema, s.players, { fantasyPositions: "fantasyPositionsJson" }],
  [
    "Matchup",
    MatchupSchema,
    s.matchups,
    {
      starters: "startersJson",
      startersPoints: "startersPointsJson",
      players: "playersJson",
      playersPoints: "playersPointsJson",
    },
  ],
  [
    "Transaction",
    TransactionSchema,
    s.transactions,
    {
      adds: "addsJson",
      drops: "dropsJson",
      rosterIds: "rosterIdsJson",
      draftPicks: "draftPicksJson",
      waiverBudget: "waiverBudgetJson",
      consenterIds: "consenterIdsJson",
    },
  ],
  ["PlayerWeekStats", PlayerWeekStatsSchema, s.playerWeekStats, { stats: "statsJson" }],
  [
    "PlayerWeekProjection",
    PlayerWeekProjectionSchema,
    s.playerWeekProjections,
    { stats: "statsJson" },
  ],
  ["ScheduleGame", ScheduleGameSchema, s.schedule, {}],
  ["UsageWeek", UsageWeekSchema, s.usageWeek, {}],
  ["TrendingEntry", TrendingEntrySchema, s.trending, {}],
  ["NflState", NflStateSchema, s.nflState, {}],
];

describe("shared domain schemas map to DB columns", () => {
  it.each(cases)("%s: every key has a column", (_name, schema, table, renames) => {
    const columns = Object.keys(getTableColumns(table));
    for (const key of Object.keys(schema.shape)) {
      expect(columns, `${_name}.${key}`).toContain(renames[key] ?? key);
    }
  });
});
