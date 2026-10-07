import { schema, setSleeperUserId } from "@sideline/db";
import { afterEach, describe, expect, it } from "vitest";
import { getLeagueOverview, getStandings } from "./league-views";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";
import { findTradesForLeague } from "./trades";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

describe("cold trade finder (10 rosters, fixture-sized)", () => {
  it("renders the Trades page server work within the 2 s TRADE-4 budget", () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h, {
      rosterCount: 10,
      rosterSize: 16,
      playerCount: 200,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "IR"],
    });
    setSleeperUserId(h, "u1");
    h.sqlite.prepare("UPDATE leagues SET playoff_teams = ? WHERE league_id = 'L1'").run(6);
    // Future pairings (1v2, 3v4, ...), weeks 5..14, so the playoff sim has a schedule to play out.
    for (let w = 5; w <= 14; w += 1) {
      for (let r = 1; r <= 10; r += 2) {
        for (const id of [r, r + 1]) {
          h.db
            .insert(schema.matchups)
            .values({
              leagueId: "L1",
              week: w,
              rosterId: id,
              matchupId: (r + 1) / 2,
              startersJson: "[]",
              startersPointsJson: "[]",
              playersJson: "[]",
              playersPointsJson: "{}",
              points: 0,
            })
            .run();
        }
      }
    }
    // Deterministic, uneven projections so the finder has both-improving trades to find.
    h.sqlite.transaction(() => {
      for (let n = 1; n <= 160; n += 1) {
        const v = 3 + ((n * 7) % 11) * 2.5;
        for (let week = 5; week <= 18; week += 1) {
          h.db
            .insert(schema.leaguePlayerWeekPoints)
            .values({ leagueId: "L1", season: 2026, week, playerId: `p${n}`, projPts: v })
            .run();
        }
      }
    })();

    const t0 = performance.now();
    getLeagueOverview(h, "L1", SEED_NOW);
    getStandings(h, "L1", SEED_NOW);
    const res = findTradesForLeague(h, "L1", SEED_NOW);
    const cold = performance.now() - t0;
    const t1 = performance.now();
    findTradesForLeague(h, "L1", SEED_NOW);
    const warm = performance.now() - t1;
    process.stdout.write(
      `trades cold ms: ${cold.toFixed(0)}, warm ms: ${warm.toFixed(1)}, suggestions: ${res.ok ? res.data.suggestions.length : "n/a"}\n`,
    );
    expect(res.ok).toBe(true);
    expect(cold).toBeLessThanOrEqual(2000);
    expect(warm).toBeLessThanOrEqual(50);
  });
});
