import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertPlayerWeekProjections, upsertPlayerWeekStats } from "../../packages/db/src/index.js";
import {
  createDefaultSleeperClient,
  mapProjection,
  mapStats,
} from "../../packages/sleeper/src/index.js";
import { createSleeperServer, recordedFixtureRoot } from "../../tests/msw/server.js";
import {
  createNflverseMock,
  createSyncHarness,
  LEAGUE_ID,
  type NflverseMock,
  type SyncHarness,
} from "../../tests/helpers/sync-harness.js";
import { createTempDb } from "../../tests/helpers/temp-db.js";
import { discoverAvailableWeeks, MIN_BACKTEST_WEEK, runBacktest } from "./backtest.js";
import { renderReport } from "./report.js";

/**
 * Fixture-backed mechanics smoke test for T3.5c (MATCH-3): proves `runBacktest` and
 * `renderReport` run end to end against the recorded fixtures without crashing, and that the
 * output is well-formed and within sane bounds. This is NOT a real historical backtest: the
 * recorded fixtures only cover league 1000000000000000001, season 2026, weeks 1 to 4, and week 4
 * (the only week clearing `MIN_BACKTEST_WEEK`) is still in progress when the fixtures were
 * recorded, so its `stats` fixture is genuinely empty (`[]`, confirmed by inspecting
 * tests/fixtures/sleeper/stats/2026/4.json) and it has zero completed player-weeks to test. That
 * is itself a real edge case worth proving: the harness discovers no actual stats for that week,
 * tests nothing, and still returns a well-formed, non-crashing, trivially `"raw_only"` report
 * rather than dividing by zero or throwing. A second test below (not fixture-based, synthetic
 * data via direct SQL into a temp DB) exercises the DvP/grid-search/Spearman math with non-trivial
 * numbers, which this fixture's limited week range cannot. The real MATCH-3 decision needs the
 * orchestrator's full 2025 + completed-2026-weeks run against live data (see docs/backtests/ for
 * the dated smoke-test report this test's own run produces).
 */
const manifest = JSON.parse(
  readFileSync(path.join(recordedFixtureRoot, "manifest.json"), "utf8"),
) as { season: string };
const SEASON = Number(manifest.season);

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let nfl: NflverseMock;
let h: SyncHarness;

beforeAll(() => server.listen());
beforeEach(() => {
  nfl = createNflverseMock();
  server.use(nfl.handler);
  h = createSyncHarness();
});
afterEach(() => {
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

/** Fetches and stores raw stats for each week directly, same pattern as
 * scripts/validate-scoring/validate.test.ts (the "stats" job only fetches the current and
 * previous week in production; this harness needs the full prior-week window for DvP). */
async function seedStatsWeeks(sync: SyncHarness, weeks: readonly number[]): Promise<void> {
  const client = createDefaultSleeperClient({ limiter: sync.limiter, version: "test" });
  for (const week of weeks) {
    const res = await client.getStats(SEASON, week, "regular");
    if (res.status !== "ok") throw new Error(`fixture stats week ${week}: ${res.status}`);
    const rows = res.rows.map((r) => mapStats(r, { season: SEASON, week, seasonType: "regular" }));
    upsertPlayerWeekStats(sync.tmp.handle, rows);
  }
}

async function seedProjectionWeeks(sync: SyncHarness, weeks: readonly number[]): Promise<void> {
  const client = createDefaultSleeperClient({ limiter: sync.limiter, version: "test" });
  for (const week of weeks) {
    const res = await client.getProjections(SEASON, week, "regular");
    if (res.status !== "ok") throw new Error(`fixture projections week ${week}: ${res.status}`);
    const fetchedAt = new Date().toISOString();
    const rows = res.rows.map((r) =>
      mapProjection(r, { season: SEASON, week, seasonType: "regular", fetchedAt }),
    );
    upsertPlayerWeekProjections(sync.tmp.handle, rows);
  }
}

describe("runBacktest end to end (MATCH-3, T3.5c requirement 6)", () => {
  it("returns a well-formed report with sane bounds on the recorded fixtures", async () => {
    const outcomes = await h.run(["state", "league", "players", "rosters", "matchups", "nflverse"]);
    expect(outcomes.filter((o) => o.status === "failed")).toEqual([]);
    // Week 4's stats fixture is genuinely empty (the week was still in progress when recorded,
    // see the module doc comment above), so only weeks 1-3 get real stats rows; week 4 still gets
    // a real projections row, which is what makes it "discoverable" below even though it ends up
    // contributing zero testable player-weeks.
    await seedStatsWeeks(h, [1, 2, 3]);
    await seedProjectionWeeks(h, [4]);

    const weeks = discoverAvailableWeeks(h.tmp.handle);
    // No week has both a stats row and a projections row on this fixture (disjoint week ranges),
    // so nothing is "discoverable" by the production definition.
    expect(weeks).toEqual([]);

    // Exercise the real MIN_BACKTEST_WEEK eligibility path directly (as the CLI would if a future
    // sync eventually produces overlapping weeks), rather than relying on `discoverAvailableWeeks`
    // finding nothing: this is the scenario the module doc comment above describes.
    const report = runBacktest(h.tmp.handle, LEAGUE_ID, {
      weeks: [{ season: SEASON, seasonType: "regular", week: 4 }],
    });

    expect(report.leagueId).toBe(LEAGUE_ID);
    expect(report.weeksEligible).toEqual([{ season: SEASON, seasonType: "regular", week: 4 }]);
    expect(report.weeksEligible.every((w) => w.week >= MIN_BACKTEST_WEEK)).toBe(true);
    // Week 4 has no stats rows at all on this fixture (see module doc comment): nothing to test.
    expect(report.playerWeeksTested).toBe(0);

    // 5x5 grid, every point well-formed even with zero player-weeks (no divide by zero).
    expect(report.grid).toHaveLength(25);
    for (const g of report.grid) {
      expect(g.mae).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(g.mae)).toBe(true);
      expect(g.spearman).toBeGreaterThanOrEqual(-1);
      expect(g.spearman).toBeLessThanOrEqual(1);
    }

    expect(report.baseline).toEqual({ mae: 0, spearman: 0 });
    expect(report.best.mae).toBeGreaterThanOrEqual(0);
    expect(["ship", "raw_only"]).toContain(report.decision);
    expect(report.decision).toBe("raw_only"); // nothing to improve on with zero player-weeks

    const rendered = renderReport(report, { title: "Smoke test" });
    expect(rendered).toContain("Smoke test");
    expect(rendered).toContain("Decision");
    expect(rendered).toContain("Double-counting risk");
    expect(rendered).toContain("2025 projections caveat");
    expect(() => renderReport(report)).not.toThrow();
  });
});

describe("runBacktest grid search mechanics (synthetic data, not fixture-based)", () => {
  /**
   * The recorded fixtures (see the suite above) have no overlapping stats/projections week, so
   * they cannot exercise the DvP prior, grid search, or Spearman math with real numbers. This
   * builds a small, fully controlled league directly via SQL (same style as
   * scripts/validate-scoring/validate.test.ts's synthetic-league tests) to prove those paths:
   * four teams, one position (WR), weeks 1 to 4.
   *
   * - TA and TB play each other every prior week (1-3); TC and TD never appear before week 4.
   *   TA's player (a1) scores 10 every prior week, TB's player (b1) scores 18: TB's offense
   *   makes TA's defense look "generous" at WR. League average WR output over weeks 1-3 is
   *   (10+18)/2 = 14 (`leaguePositionAverage`). TA's DvP: n = 3, k = 4 (default), w = 3/7,
   *   rawAvg = 18, so `ptsAllowedPg` = 3/7*18 + 4/7*14 = 15.714286. TC's DvP has zero games
   *   (n = 0), so `w` = 0 and `ptsAllowedPg` = `leaguePositionAverage` = 14 exactly: TC is a
   *   deliberately neutral control, its DvP/avgPos ratio is exactly 1, so the alpha term is
   *   exactly 0 for whoever faces it, at every alpha. This sidesteps `matchupMultiplier`'s
   *   [0.85, 1.15] clamp entirely (both tested multipliers below land inside that range), which a
   *   simpler two-team version of this test did not: with only two teams, TA's "generous" push
   *   and TB's "tough" push had equal and opposite magnitude and clamped at the same alpha,
   *   making total absolute error exactly invariant across the whole alpha grid.
   * - Week 4: TA vs TB again (b1 now faces TA, the generous defense) and TC vs TD (d1 faces TC,
   *   the neutral control). b1's multiplier at alpha = 1: 1 + 1*(15.714286/14 - 1) = 1.122449.
   *   d1's multiplier at any alpha: 1 + alpha*(14/14 - 1) = 1 exactly.
   * - Hand-computed baseline (alpha = 0, beta = 0): b1 |10 - 16| = 6, d1 |10 - 10| = 0.
   *   MAE = (6 + 0) / 2 = 3.
   * - Hand-computed at alpha = 1 (the grid's max; b1's error decreases monotonically over
   *   [0, 1], never overshooting 16, so alpha = 1 is also the grid's best): b1 adjusted =
   *   10 * 1.122449 = 11.22449, error = 4.77551; d1 error stays 0. MAE = (4.77551 + 0) / 2 =
   *   2.387755. Improvement over baseline: (3 - 2.387755) / 3 * 100 = 20.41%, clears the 1%
   *   MATCH-3 bar, so the decision is `"ship"`.
   *
   * This is a unit test of the decision math on constructed numbers, not a claim about any real
   * league; it does not touch `DEFAULT_MATCHUP_ADJUSTMENT_CONFIG`.
   */
  it("finds a lower-MAE alpha when the synthetic matchup signal is real", () => {
    const tmp = createTempDb();
    try {
      const now = new Date().toISOString();
      const season = 2030;

      tmp.handle.sqlite
        .prepare(
          `INSERT INTO leagues (
            league_id, season, name, status, settings_json, scoring_json, roster_positions_json,
            total_rosters, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "synthetic-league",
          season,
          "Synthetic League",
          "in_season",
          "{}",
          JSON.stringify({ pts: 1 }),
          "[]",
          4,
          now,
        );

      // TC has no roster at all: it only needs to exist as a schedule participant.
      const players: { id: string; team: string; position: string }[] = [
        { id: "a1", team: "TA", position: "WR" },
        { id: "b1", team: "TB", position: "WR" },
        { id: "d1", team: "TD", position: "WR" },
      ];
      const insertPlayer = tmp.handle.sqlite.prepare(
        `INSERT INTO players (player_id, full_name, fantasy_positions_json, team, position, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const p of players) insertPlayer.run(p.id, p.id, "[]", p.team, p.position, now);

      const insertGame = tmp.handle.sqlite.prepare(
        `INSERT INTO schedule (season, week, game_id, game_type, home, away)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      // Prior weeks: only TA vs TB plays (TC, TD are idle so TC's DvP prior stays empty).
      for (let week = 1; week <= 3; week += 1)
        insertGame.run(season, week, `g${week}a`, "REG", "TA", "TB");
      // Week 4: both pairings play.
      insertGame.run(season, 4, "g4a", "REG", "TA", "TB");
      insertGame.run(season, 4, "g4b", "REG", "TC", "TD");

      const insertStats = tmp.handle.sqlite.prepare(
        `INSERT INTO player_week_stats (season, season_type, week, player_id, stats_json, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (let week = 1; week <= 3; week += 1) {
        insertStats.run(season, "regular", week, "a1", JSON.stringify({ pts: 10 }), "sleeper");
        insertStats.run(season, "regular", week, "b1", JSON.stringify({ pts: 18 }), "sleeper");
      }
      // Week 4: b1 (facing TA, the generous defense) outperforms a moderate raw projection; d1
      // (facing TC, the neutral control) matches its raw projection exactly.
      insertStats.run(season, "regular", 4, "b1", JSON.stringify({ pts: 16 }), "sleeper");
      insertStats.run(season, "regular", 4, "d1", JSON.stringify({ pts: 10 }), "sleeper");

      const insertProj = tmp.handle.sqlite.prepare(
        `INSERT INTO player_week_projections (season, season_type, week, player_id, stats_json, opponent, fetched_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertProj.run(season, "regular", 4, "b1", JSON.stringify({ pts: 10 }), "TA", now, "sleeper");
      insertProj.run(season, "regular", 4, "d1", JSON.stringify({ pts: 10 }), "TC", now, "sleeper");

      const report = runBacktest(tmp.handle, "synthetic-league", {
        weeks: [{ season, seasonType: "regular", week: 4 }],
      });

      expect(report.playerWeeksTested).toBe(2);
      expect(report.baseline.mae).toBeCloseTo(3, 10);
      expect(report.best.alpha).toBe(1);
      expect(report.best.mae).toBeCloseTo(2.387755, 5);
      expect(report.best.mae).toBeLessThan(report.baseline.mae);
      expect(report.maeImprovementPct).toBeCloseTo(20.41, 1);
      expect(report.decision).toBe("ship");

      // beta never affects the result (no implied-team-total source wired up): every beta value
      // ties for the winning alpha.
      const atBestAlpha = report.grid.filter((g) => g.alpha === report.best.alpha);
      const maes = new Set(atBestAlpha.map((g) => g.mae.toFixed(10)));
      expect(maes.size).toBe(1);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("runBacktest on a database with no matching league", () => {
  it("throws a clear error instead of silently returning an empty report", () => {
    const tmp = createTempDb();
    try {
      expect(() =>
        runBacktest(tmp.handle, "does-not-exist", {
          weeks: [{ season: 2026, seasonType: "regular", week: 4 }],
        }),
      ).toThrow(/no league/);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("runBacktest empty-input guards", () => {
  it("returns a raw_only decision with zero MAE when there are no eligible weeks at all", () => {
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

      const report = runBacktest(tmp.handle, "empty-league", {
        weeks: [{ season: 2026, seasonType: "regular", week: 1 }], // below MIN_BACKTEST_WEEK
      });
      expect(report.weeksEligible).toEqual([]);
      expect(report.playerWeeksTested).toBe(0);
      expect(report.baseline).toEqual({ mae: 0, spearman: 0 });
      expect(report.decision).toBe("raw_only");
    } finally {
      tmp.cleanup();
    }
  });

  it("deduplicates repeated week specs", () => {
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
        .run("dup-league", 2026, "Dup League", "in_season", "{}", "{}", "[]", 10, now);

      const report = runBacktest(tmp.handle, "dup-league", {
        weeks: [
          { season: 2026, seasonType: "regular", week: 4 },
          { season: 2026, seasonType: "regular", week: 4 },
        ],
      });
      expect(report.weeksRequested).toEqual([{ season: 2026, seasonType: "regular", week: 4 }]);
      expect(report.weeksEligible).toEqual([{ season: 2026, seasonType: "regular", week: 4 }]);
    } finally {
      tmp.cleanup();
    }
  });
});
