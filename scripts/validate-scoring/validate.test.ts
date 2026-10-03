import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertPlayerWeekStats } from "../../packages/db/src/index.js";
import { createDefaultSleeperClient, mapStats } from "../../packages/sleeper/src/index.js";
import { createSleeperServer, recordedFixtureRoot } from "../../tests/msw/server.js";
import {
  createSyncHarness,
  LEAGUE_ID,
  type SyncHarness,
} from "../../tests/helpers/sync-harness.js";
import { createTempDb } from "../../tests/helpers/temp-db.js";
import { validateScoring } from "./validate.js";

/**
 * Fixture-backed end to end test for requirement 5 of T3.1: proves `validateScoring` matches
 * Sleeper's own `players_points` for league 1000000000000000001, weeks 1 to 3 (week 4 is
 * partial and excluded per ADR-000 item 9; the phase 0 spike measured 457 of 457 matches on this
 * same league and weeks, docs/sleeper-api-notes.md section 5).
 *
 * The worker's own "stats" sync job only ever fetches the current and previous week (production
 * behavior: it re-checks recent weeks for stat corrections, not a full backfill), so after a
 * normal `pnpm db:seed:fixtures`-equivalent sync, only week 3 (plus the empty week 4) would have
 * `player_week_stats` rows. This test fetches weeks 1 to 3 directly from the recorded fixtures
 * (through the same mocked Sleeper endpoint the worker uses) to populate the full window
 * `validateScoring` needs, entirely offline.
 */
const manifest = JSON.parse(
  readFileSync(path.join(recordedFixtureRoot, "manifest.json"), "utf8"),
) as { season: string; weeks: number[] };

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let h: SyncHarness;

beforeAll(() => server.listen());
beforeEach(() => {
  h = createSyncHarness();
});
afterEach(() => {
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

/** Fetches and stores raw stats for each week directly (see module doc comment for why). */
async function seedStatsWeeks(sync: SyncHarness, weeks: readonly number[]): Promise<void> {
  const client = createDefaultSleeperClient({ limiter: sync.limiter, version: "test" });
  const season = Number(manifest.season);
  for (const week of weeks) {
    const res = await client.getStats(season, week, "regular");
    if (res.status !== "ok") throw new Error(`fixture stats week ${week}: ${res.status}`);
    const rows = res.rows.map((r) => mapStats(r, { season, week, seasonType: "regular" }));
    upsertPlayerWeekStats(sync.tmp.handle, rows);
  }
}

describe("validateScoring end to end (SCORE-2, T3.1 requirement 5)", () => {
  it("matches players_points for 457 of 457 player-weeks on the fixture league, weeks 1-3", async () => {
    const outcomes = await h.run(["state", "league", "rosters", "matchups"]);
    expect(outcomes.filter((o) => o.status === "failed")).toEqual([]);
    await seedStatsWeeks(h, [1, 2, 3]);

    const report = validateScoring(h.tmp.handle, LEAGUE_ID, { throughWeek: 3 });

    expect(report.weeksChecked).toEqual([1, 2, 3]);
    expect(report.totalPlayerWeeks).toBe(457);
    expect(report.matchCount).toBe(457);
    expect(report.matchRate).toBe(1);
    expect(report.mismatches).toEqual([]);
    expect(report.suspectStatKeys).toEqual([]);
  });

  it("excludes the partial current week (4) even if it has matchup rows with no stats", async () => {
    const outcomes = await h.run(["state", "league", "rosters", "matchups"]);
    expect(outcomes.filter((o) => o.status === "failed")).toEqual([]);
    await seedStatsWeeks(h, [1, 2, 3]); // week 4 deliberately left unseeded (it is unavailable anyway)

    const report = validateScoring(h.tmp.handle, LEAGUE_ID, { throughWeek: 3 });
    expect(report.weeksChecked).not.toContain(4);
  });
});

describe("validateScoring on a database with no matching league", () => {
  it("throws a clear error instead of returning a false 100%", () => {
    const tmp = createTempDb();
    try {
      expect(() => validateScoring(tmp.handle, "does-not-exist", { throughWeek: 1 })).toThrow(
        /no league/,
      );
    } finally {
      tmp.cleanup();
    }
  });
});

describe("validateScoring reports mismatches with suspect stat keys", () => {
  it("flags a diff and tallies the scoring key missing from the player's stats row", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "test-league",
          2026,
          "Test League",
          "in_season",
          "{}",
          JSON.stringify({ rec: 1, rec_td: 6 }),
          "[]",
          10,
          now,
        );
      // Sleeper says this player scored 9 (1 reception + a TD), but the stored stats row only
      // has the reception: computed = 1, expected = 9, a real mismatch.
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO matchups (
            league_id, week, roster_id, matchup_id, starters_json, starters_points_json,
            players_json, players_points_json, points
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "test-league",
          1,
          1,
          1,
          "[]",
          "[]",
          JSON.stringify(["p1"]),
          JSON.stringify({ p1: 9 }),
          9,
        );
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO player_week_stats (season, season_type, week, player_id, stats_json, source)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(2026, "regular", 1, "p1", JSON.stringify({ rec: 1 }), "sleeper");

      const report = validateScoring(tmp.handle, "test-league", { throughWeek: 1 });
      expect(report.totalPlayerWeeks).toBe(1);
      expect(report.matchCount).toBe(0);
      expect(report.matchRate).toBe(0);
      expect(report.mismatches).toEqual([
        { playerId: "p1", week: 1, expected: 9, computed: 1, diff: 8 },
      ]);
      expect(report.suspectStatKeys).toEqual([{ key: "rec_td", count: 1 }]);
    } finally {
      tmp.cleanup();
    }
  });

  it("treats a player with no stats row at all as computed 0 (PLAN 5.1)", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "test-league-2",
          2026,
          "Test League 2",
          "in_season",
          "{}",
          JSON.stringify({ rec: 1 }),
          "[]",
          10,
          now,
        );
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO matchups (
            league_id, week, roster_id, matchup_id, starters_json, starters_points_json,
            players_json, players_points_json, points
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "test-league-2",
          1,
          1,
          1,
          "[]",
          "[]",
          JSON.stringify(["p2"]),
          JSON.stringify({ p2: 3 }),
          3,
        );

      const report = validateScoring(tmp.handle, "test-league-2", { throughWeek: 1 });
      expect(report.mismatches).toEqual([
        { playerId: "p2", week: 1, expected: 3, computed: 0, diff: 3 },
      ]);
      expect(report.suspectStatKeys).toEqual([{ key: "rec", count: 1 }]);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("validateScoring empty-input guard", () => {
  it("reports a match rate of 1 when there are no player-weeks to check (nothing to fail on)", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("empty-league", 2026, "Empty League", "in_season", "{}", "{}", "[]", 10, now);
      const report = validateScoring(tmp.handle, "empty-league", { throughWeek: 1 });
      expect(report.totalPlayerWeeks).toBe(0);
      expect(report.matchRate).toBe(1);
      expect(report.mismatches).toEqual([]);
    } finally {
      tmp.cleanup();
    }
  });

  it("uses nfl_state.week - 1 for completed weeks when throughWeek is omitted", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("state-league", 2026, "State League", "in_season", "{}", "{}", "[]", 10, now);
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO nfl_state (id, season, week, season_type, display_week, leg, fetched_at)
           VALUES (1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(2026, 4, "regular", 4, 4, now);
      const report = validateScoring(tmp.handle, "state-league");
      expect(report.weeksChecked).toEqual([1, 2, 3]);
    } finally {
      tmp.cleanup();
    }
  });

  it("returns no completed weeks when nfl_state has never synced and no throughWeek is given", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("no-state-league", 2026, "No State League", "in_season", "{}", "{}", "[]", 10, now);
      const report = validateScoring(tmp.handle, "no-state-league");
      expect(report.weeksChecked).toEqual([]);
      expect(report.totalPlayerWeeks).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });
});
