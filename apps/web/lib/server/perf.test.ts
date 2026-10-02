import { setSleeperUserId } from "@sideline/db";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLeagueOverview,
  getMyTeam,
  getStandings,
  getTeamDetail,
  searchPlayers,
} from "./league-views";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

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
    };
    // Numbers are printed so the task report can quote them.
    process.stdout.write(`p95 ms: ${JSON.stringify(results)}` + "\n");
    for (const [name, ms] of Object.entries(results)) {
      expect(ms, name).toBeLessThanOrEqual(300);
    }
  });
});
