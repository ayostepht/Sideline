import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPathFromDataDir, openDb, type DbHandle } from "../../packages/db/src/index.js";
import {
  getLeagueOverview,
  getMyTeam,
  getStandings,
  getTeamDetail,
  searchPlayers,
} from "../../apps/web/lib/server/league-views.js";

/**
 * PLAN 6.6 (read budget): p95 of each Phase 2 server data function on the real fixture-seeded
 * database (10 rosters, ~1,000 players, full schedule), 50 runs each, at most 300 ms.
 * The seed is the same one the e2e server uses (`pnpm db:seed:fixtures`, offline).
 */
const LEAGUE_ID = "1000000000000000001";
const RUNS = 50;
const BUDGET_MS = 300;
const repoRoot = path.resolve(import.meta.dirname, "../..");

let dataDir = "";
let handle: DbHandle;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "sideline-perf-"));
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

function p95(fn: () => unknown): number {
  fn(); // warm the statement cache; the budget is for steady state
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.ceil(RUNS * 0.95) - 1] ?? Number.NaN;
}

describe("PERF-1 (PLAN 6.6): server read functions on the fixture DB", () => {
  it("PERF-1: p95 over 50 runs is at most 300 ms for every read function", () => {
    const now = new Date();
    // Sanity first: a fast function that returns not_found would pass the budget for the wrong reason.
    expect(getLeagueOverview(handle, LEAGUE_ID, now).ok).toBe(true);
    expect(getStandings(handle, LEAGUE_ID, now).ok).toBe(true);
    expect(getTeamDetail(handle, LEAGUE_ID, 4, now).ok).toBe(true);
    expect(getMyTeam(handle, LEAGUE_ID, now).ok).toBe(true);
    const search = searchPlayers(handle, LEAGUE_ID, "mahomes", 10);
    expect(search.ok && search.data.length > 0).toBe(true);

    const results: Record<string, number> = {
      getLeagueOverview: p95(() => getLeagueOverview(handle, LEAGUE_ID, now)),
      getStandings: p95(() => getStandings(handle, LEAGUE_ID, now)),
      getTeamDetail: p95(() => getTeamDetail(handle, LEAGUE_ID, 4, now)),
      getMyTeam: p95(() => getMyTeam(handle, LEAGUE_ID, now)),
      searchPlayers: p95(() => searchPlayers(handle, LEAGUE_ID, "mahomes", 10)),
    };
    const rounded = Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    );
    process.stdout.write(`PERF-1 p95 ms (fixture DB, ${RUNS} runs): ${JSON.stringify(rounded)}\n`);
    for (const [name, ms] of Object.entries(results)) {
      expect(ms, `${name} p95`).toBeLessThanOrEqual(BUDGET_MS);
    }
  });
});
