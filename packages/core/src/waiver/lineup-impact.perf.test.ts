/**
 * WAIVER-2 (PLAN 5.6): "Prefilter to the top 75 candidates ... Target: under 2 s total" for the
 * Lineup Impact calculation (75 candidates x 3 weeks = 225 week-evaluations, each running
 * `solveOptimalAssignment` twice on a ~16-player, 10-slot roster).
 */
import { describe, expect, it } from "vitest";
import { computeLineupImpact, type LineupImpactRosterPlayer } from "./lineup-impact.js";

const ROSTER_POSITIONS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "K",
  "DEF",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
  "IR",
];

const POSITION_CYCLE = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

function buildRoster(count: number): LineupImpactRosterPlayer[] {
  const players: LineupImpactRosterPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const position = POSITION_CYCLE[i % POSITION_CYCLE.length] as string;
    const week1 = 5 + ((i * 7) % 20);
    players.push({
      playerId: `ROSTER_${i}`,
      fantasyPositions: [position],
      isIR: false,
      weeklyValues: { 1: week1, 2: week1 - 1, 3: week1 + 2 },
      rosInput: {
        weeks: [
          { week: 1, projectedPoints: week1 },
          { week: 2, projectedPoints: week1 - 1 },
          { week: 3, projectedPoints: week1 + 2 },
        ],
        seasonPpg: week1,
      },
    });
  }
  return players;
}

describe("computeLineupImpact performance (WAIVER-2)", () => {
  it("evaluates 75 candidates across 3 weeks in well under the 2000ms budget", () => {
    const roster = buildRoster(16);
    const weeks = [1, 2, 3];

    const start = performance.now();
    for (let c = 0; c < 75; c++) {
      const position = POSITION_CYCLE[c % POSITION_CYCLE.length] as string;
      computeLineupImpact({
        rosterPositions: ROSTER_POSITIONS,
        roster,
        candidate: {
          playerId: `CAND_${c}`,
          fantasyPositions: [position],
          weeklyValues: { 1: 6 + (c % 15), 2: 5 + (c % 12), 3: 7 + (c % 10) },
        },
        weeks,
      });
    }
    const durationMs = performance.now() - start;

    // Real margin against the 2000ms spec budget, not an edge-of-flaky assertion.
    expect(durationMs).toBeLessThan(1000);
  });
});
