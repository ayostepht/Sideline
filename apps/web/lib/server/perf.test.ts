import { setSleeperUserId, type DbHandle } from "@sideline/db";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLeagueOverview,
  getMyTeam,
  getStandings,
  getTeamDetail,
  searchPlayers,
} from "./league-views";
import { getPlayerDetail, getPlayersList } from "./players";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";
import { getWaivers } from "./waivers";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function p95(fn: () => unknown, runs = 50): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.ceil(runs * 0.95) - 1] ?? 0;
}

describe("read performance on a realistic DB (12 rosters x 16, 1,000 players, full schedule)", () => {
  it("each read function has p95 at most 300 ms", () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h, { rosterCount: 12, rosterSize: 16, playerCount: 1000, schedule: true });
    setSleeperUserId(h, "u3");
    const results: Record<string, number> = {
      overview: p95(() => getLeagueOverview(h, "L1", SEED_NOW)),
      standings: p95(() => getStandings(h, "L1", SEED_NOW)),
      teamDetail: p95(() => getTeamDetail(h, "L1", 5, SEED_NOW)),
      myTeam: p95(() => getMyTeam(h, "L1", SEED_NOW)),
      search: p95(() => searchPlayers(h, "L1", "number", 10)),
      // T4.7: confirmed gap from the Phase 4 batch D/F code reviews - `getWaivers` and
      // `getPlayersList` were not covered here before this task.
      waivers: p95(() => getWaivers(h, "L1", {}, SEED_NOW)),
      playersList: p95(() => getPlayersList(h, "L1", { page: 1, pageSize: 25 }, SEED_NOW)),
    };
    // Numbers are printed so the task report can quote them.
    process.stdout.write(`p95 ms: ${JSON.stringify(results)}` + "\n");
    for (const [name, ms] of Object.entries(results)) {
      expect(ms, name).toBeLessThanOrEqual(300);
    }
  });
});

/** Bulk-inserts one `actualPts` row per (playerId, week) pair via a single transaction - the
 * `insertProj`-style raw-insert convention `waivers.test.ts` uses, scaled up: this seeds ~17,000
 * rows (1,000 players x 17 weeks) for the Home-aggregate case below, which needs every played week
 * on the whole-league table actually populated (not just one player's), since that table is what
 * `readLeagueWeekPositionRanks` rescans per week. */
function insertWeeklyActualsForAllPlayers(
  h: DbHandle,
  leagueId: string,
  season: number,
  playerCount: number,
  weeks: readonly number[],
): void {
  const stmt = h.sqlite.prepare(
    `INSERT INTO league_player_week_points (league_id, season, week, player_id, actual_pts, proj_pts)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = h.sqlite.transaction((rows: { week: number; playerId: string }[]) => {
    for (const r of rows) {
      const pts = 5 + (Number(r.playerId.slice(1)) % 20);
      stmt.run(leagueId, season, r.week, r.playerId, pts, pts);
    }
  });
  const rows: { week: number; playerId: string }[] = [];
  for (let n = 1; n <= playerCount; n += 1) {
    for (const week of weeks) rows.push({ week, playerId: `p${String(n)}` });
  }
  insertAll(rows);
}

/** Same bulk-insert shape for `usage_week` (brief point 5: Home's loop also exercises
 * `readUsageWeek`, one call per played week, though that table is season+week indexed and not the
 * one flagged as expensive - seeded anyway for a realistic late-season snapshot). */
function insertWeeklyUsageForAllPlayers(
  h: DbHandle,
  season: number,
  playerCount: number,
  weeks: readonly number[],
): void {
  const stmt = h.sqlite.prepare(
    `INSERT INTO usage_week (season, week, player_id, snap_pct) VALUES (?, ?, ?, ?)`,
  );
  const insertAll = h.sqlite.transaction((rows: { week: number; playerId: string }[]) => {
    for (const r of rows) stmt.run(season, r.week, r.playerId, 0.5);
  });
  const rows: { week: number; playerId: string }[] = [];
  for (let n = 1; n <= playerCount; n += 1) {
    for (const week of weeks) rows.push({ week, playerId: `p${String(n)}` });
  }
  insertAll(rows);
}

/**
 * T4.7 (follow-up to `docs/reviews/2026-10-03-p4-batchF-code.md`'s M1 finding): Home's "Rising
 * players" card calls `getPlayerDetail` once per roster player (~15-20 calls) on every Home load.
 * Each call's `consistencyWeeksFor` calls `readLeagueWeekPositionRanks` once per week the player has
 * played, and that function rescans the WHOLE `league_player_week_points` table (every player, every
 * week) plus the whole `players` table on every call - a cost that was never measured past the
 * fixture data's week-4 cap. This seeds a realistic late-season snapshot (weeks 1-17 actually
 * populated for all 1,000 players, current week set to 17) and measures the real cost of the
 * loop Home actually runs.
 *
 * Budget: this repo's standing per-data-function budget (`perf.test.ts` above, PLAN 6.6) is 300 ms
 * per call. Home's loop is not one call but ~15-20 sequential ones, so the natural aggregate budget
 * is `300 ms x roster size` (here, rosterSize = 16, the same seed shape as the suite above) = 4,800
 * ms for the whole loop - i.e. no single roster player's detail fetch may, on average, cost more
 * than the standard per-call budget, even though they are all paid for on one page load. This is
 * documented here rather than reusing the 50-run `p95` helper unchanged: each of the 16 calls is a
 * genuinely different, non-idempotent-cost player (not 50 repetitions of the same call), so the
 * loop itself is run several times and the slowest full pass is reported, rather than a per-call p95
 * across identical calls.
 */
describe("getPlayerDetail aggregate cost at a realistic late-season week (T4.7, Home's Rising-players loop)", () => {
  it("one getPlayerDetail call per roster player (16 calls) stays within the whole-loop budget", () => {
    // This single test seeds ~34,000 rows and runs several full 16-call passes; it is intentionally
    // slower than the default per-test timeout, not flaky.
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h, { rosterCount: 12, rosterSize: 16, playerCount: 1000, schedule: true });

    const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
    insertWeeklyActualsForAllPlayers(h, "L1", 2026, 1000, weeks);
    insertWeeklyUsageForAllPlayers(h, 2026, 1000, weeks);
    h.sqlite
      .prepare(`UPDATE nfl_state SET week = 17, display_week = 17, leg = 17 WHERE id = 1`)
      .run();

    // Roster 3's players (seedLeague: roster i owns p[(i-1)*rosterSize+1 .. i*rosterSize]).
    const rosterPlayerIds = Array.from({ length: 16 }, (_, k) => `p${String(2 * 16 + k + 1)}`);
    expect(rosterPlayerIds).toHaveLength(16);

    const ROSTER_SIZE = 16;
    const PER_CALL_BUDGET_MS = 300;
    const AGGREGATE_BUDGET_MS = PER_CALL_BUDGET_MS * ROSTER_SIZE;

    const passes = 2;
    let worst = 0;
    for (let pass = 0; pass < passes; pass += 1) {
      const t0 = performance.now();
      for (const playerId of rosterPlayerIds) {
        const result = getPlayerDetail(h, "L1", playerId, SEED_NOW);
        if (!result.ok) throw new Error(`expected ok for ${playerId}`);
      }
      const elapsed = performance.now() - t0;
      worst = Math.max(worst, elapsed);
    }
    // Printed unconditionally (not just on failure) so the task report can quote the real number,
    // whichever side of the budget it lands on (CLAUDE.md section 4: never adjust the threshold to
    // force a pass - report honestly instead).
    process.stdout.write(
      `getPlayerDetail x${String(rosterPlayerIds.length)} worst-of-${String(passes)} total ms: ${worst.toFixed(1)} (budget ${String(AGGREGATE_BUDGET_MS)})\n`,
    );
    expect(worst).toBeLessThanOrEqual(AGGREGATE_BUDGET_MS);
  }, 30_000);
});
