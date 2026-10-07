/** TRADE-2 perf: 12 teams x 16 players, default settings, finder under 1500 ms. */
import { describe, expect, it } from "vitest";
import { computePositionalHeatmap } from "../league/positional-heatmap.js";
import { findTrades } from "./finder.js";
import { mulberry32, pl, simpleHeatmapEntries } from "./fixtures.js";
import type { TradeTeam } from "./lineup.js";

const POS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN"];
const CYCLE = [
  "QB",
  "QB",
  "RB",
  "RB",
  "RB",
  "RB",
  "WR",
  "WR",
  "WR",
  "WR",
  "WR",
  "TE",
  "TE",
  "RB",
  "WR",
  "TE",
];

describe("findTrades performance", () => {
  it("12 teams x 16 players under 1500 ms", () => {
    const rnd = mulberry32(7);
    const teams: TradeTeam[] = Array.from({ length: 12 }, (_, t) => {
      // Skew each team toward RB or WR so many complementary pairs exist.
      const rbHeavy = t % 2 === 0;
      return {
        rosterId: t + 1,
        players: CYCLE.map((pos, i) =>
          pl(
            `t${t}p${i}`,
            pos,
            Math.round((3 + rnd() * 20 + (pos === (rbHeavy ? "RB" : "WR") ? 8 : 0)) * 10) / 10,
            i === 15 && t % 3 === 0,
          ),
        ),
      };
    });
    const heatmap = computePositionalHeatmap(simpleHeatmapEntries(teams));
    const me = teams[0] as TradeTeam;
    const start = performance.now();
    const r = findTrades({ rosterPositions: POS, me, others: teams.slice(1), heatmap });
    const ms = performance.now() - start;
    expect(r.evaluatedCount).toBeGreaterThan(100);
    expect(ms, `took ${ms.toFixed(0)} ms for ${r.evaluatedCount} evaluations`).toBeLessThan(1500);
    expect(ms).toBeLessThan(1500);
  });
});
