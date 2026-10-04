import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPathFromDataDir, openDb, type DbHandle } from "../../packages/db/src/index.js";
import { getMatchup } from "../../apps/web/lib/server/matchup.js";
import { getLeagueIntelligence } from "../../apps/web/lib/server/league-intelligence.js";
import { getRosterStrength } from "../../apps/web/lib/server/roster-strength.js";

/**
 * T5.6 req 4: p95 timing of the three Phase 5 server data functions against the real
 * fixture-seeded database (10 rosters), cold (`computed_cache` empty) and warm (cache hit), each
 * over 20 runs.
 *
 * Budgets, and why they differ from PLAN 6.6's existing 300 ms read budget (see
 * `web-read-perf.integration.test.ts`, which covers Phase 2's plain SQL reads):
 *
 * - `getMatchup` (SIM-3's own budget is "10,000 iterations in under 300 ms for two 10-slot
 *   lineups" for the PURE `simulateMatchup` call alone -- see `packages/core/src/sim/matchup.ts`'s
 *   own perf test). The wired function adds real SQLite reads (rosters, projections, history,
 *   position CV, players, byes) on top of that one simulation call. Measured on this fixture: p95
 *   cold is about 12 ms, two orders of magnitude under budget. 150 ms gives about 10x headroom
 *   over the measured value for a slower CI machine while staying well clear of SIM-3's own 300 ms
 *   pure-simulation ceiling (the wired overhead on top of one simulation call should never itself
 *   approach the budget for the simulation alone).
 * - `getRosterStrength` runs ONE optimizer solve (`recommendLineup`) per roster (10 rosters on
 *   this fixture), no Monte Carlo simulation at all. Measured p95 cold is about 4-8 ms. 150 ms
 *   matches `getMatchup`'s budget (same order of magnitude of real work: a handful of cheap
 *   per-roster solves) with the same headroom reasoning.
 * - `getLeagueIntelligence` is the heaviest: it calls `getRosterStrength` once (10 optimizer
 *   solves) PLUS one `simulatePlayoffOdds` Monte Carlo run of 10,000 iterations (one run for the
 *   whole league, not per team -- see `playoff-odds.ts`), plus all-play/luck/heatmap/manager-
 *   tendencies aggregation across every team. Measured p95 cold is about 45-50 ms. 300 ms (PLAN
 *   6.6's existing budget) gives about 6x headroom, which is tighter than the other two but
 *   appropriate given this function does strictly more real work than either on its own; a larger
 *   league (more rosters, more weeks of history) would cost proportionally more here than for the
 *   other two, so this budget intentionally has less slack to keep the test meaningful as a guard
 *   against a real regression, not just a rubber stamp.
 * - Warm (cache hit) budget: 50 ms for all three. Measured p95 warm is sub-millisecond for every
 *   function (a single `computed_cache` row read plus a zod parse); 50 ms is generous enough to
 *   never flake on a loaded CI runner while still being a small fraction of every cold budget
 *   above, so the "warm is dramatically faster than cold" requirement is also asserted directly
 *   (warm p95 < half of cold p95), not just implied by two separate absolute budgets.
 */
const LEAGUE_ID = "1000000000000000001";
const RUNS = 20;
const COLD_BUDGET_MS = { getMatchup: 150, getRosterStrength: 150, getLeagueIntelligence: 300 };
const WARM_BUDGET_MS = 50;
const repoRoot = path.resolve(import.meta.dirname, "../..");

let dataDir = "";
let handle: DbHandle;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "sideline-sim-league-perf-"));
  const seed = spawnSync("pnpm", ["db:seed:fixtures"], {
    cwd: repoRoot,
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: "utf8",
  });
  if (seed.status !== 0) throw new Error(`fixture seed failed:\n${seed.stdout}\n${seed.stderr}`);
  handle = openDb(dbPathFromDataDir(dataDir));
}, 120_000);

afterAll(() => {
  handle?.sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function p95(times: readonly number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.NaN;
}

/** Clears the cache, then measures `RUNS` cold calls (cache cleared before every single call). */
function coldP95(fn: () => unknown): number {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    handle.sqlite.prepare("DELETE FROM computed_cache").run();
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return p95(times);
}

/** Warms the cache once, then measures `RUNS` cache-hit calls. */
function warmP95(fn: () => unknown): number {
  fn(); // warm the cache (and the SQLite statement cache)
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return p95(times);
}

describe("T5.6 req 4 (PLAN 6.6-style budget): getMatchup/getLeagueIntelligence/getRosterStrength perf on the fixture DB", () => {
  it("cold (computed_cache empty) p95 over 20 runs is within budget for every function", () => {
    const now = new Date();
    // Sanity first: a fast function that returns not_found would pass the budget for the wrong reason.
    expect(getMatchup(handle, LEAGUE_ID, { week: 4, rosterId: 4 }, now).ok).toBe(true);
    expect(getRosterStrength(handle, LEAGUE_ID, now).ok).toBe(true);
    expect(getLeagueIntelligence(handle, LEAGUE_ID, now).ok).toBe(true);

    const results = {
      getMatchup: coldP95(() => getMatchup(handle, LEAGUE_ID, { week: 4, rosterId: 4 }, now)),
      getRosterStrength: coldP95(() => getRosterStrength(handle, LEAGUE_ID, now)),
      getLeagueIntelligence: coldP95(() => getLeagueIntelligence(handle, LEAGUE_ID, now)),
    };
    const rounded = Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    );
    process.stdout.write(
      `PERF (T5.6 req 4) cold p95 ms (fixture DB, ${String(RUNS)} runs): ${JSON.stringify(rounded)}\n`,
    );
    for (const [name, ms] of Object.entries(results)) {
      expect(ms, `${name} cold p95`).toBeLessThanOrEqual(
        COLD_BUDGET_MS[name as keyof typeof COLD_BUDGET_MS],
      );
    }
  });

  it("warm (computed_cache hit) p95 over 20 runs is within budget and dramatically faster than cold", () => {
    const now = new Date();
    handle.sqlite.prepare("DELETE FROM computed_cache").run();

    const coldResults = {
      getMatchup: coldP95(() => getMatchup(handle, LEAGUE_ID, { week: 4, rosterId: 4 }, now)),
      getRosterStrength: coldP95(() => getRosterStrength(handle, LEAGUE_ID, now)),
      getLeagueIntelligence: coldP95(() => getLeagueIntelligence(handle, LEAGUE_ID, now)),
    };
    const warmResults = {
      getMatchup: warmP95(() => getMatchup(handle, LEAGUE_ID, { week: 4, rosterId: 4 }, now)),
      getRosterStrength: warmP95(() => getRosterStrength(handle, LEAGUE_ID, now)),
      getLeagueIntelligence: warmP95(() => getLeagueIntelligence(handle, LEAGUE_ID, now)),
    };
    const rounded = Object.fromEntries(
      Object.entries(warmResults).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    );
    process.stdout.write(
      `PERF (T5.6 req 4) warm p95 ms (fixture DB, ${String(RUNS)} runs): ${JSON.stringify(rounded)}\n`,
    );
    for (const name of Object.keys(warmResults) as (keyof typeof warmResults)[]) {
      expect(warmResults[name], `${name} warm p95`).toBeLessThanOrEqual(WARM_BUDGET_MS);
      // "computed_cache means a second call for the same inputs should be dramatically faster
      // than the first" -- asserted directly as a relative claim, not just two separate absolute
      // budgets that happen to both pass.
      expect(warmResults[name], `${name} warm p95 vs cold p95`).toBeLessThan(coldResults[name] / 2);
    }
  });
});
