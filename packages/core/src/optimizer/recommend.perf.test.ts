/**
 * LINEUP-7 (PLAN 5.4): `recommendLineup` must complete in under 50ms for any roster of 30 or
 * fewer players. T3.4a's Hungarian solve is O(n^3) on at most ~40 total rows/columns (10 slots +
 * 30 players), so a typical run is expected in the low single digits of milliseconds; the budget
 * below asserts comfortably under the 50ms spec, not at the edge, to avoid a flaky perf test.
 */
import { describe, expect, it } from "vitest";
import type { SlotSpec } from "./eligibility.js";
import { recommendLineup, type RecommendLineupPlayer } from "./recommend.js";

// Standard 10-slot starting lineup: QB, 2x RB, 3x WR, TE, FLEX, K, DEF.
const SLOTS: SlotSpec[] = [
  { slotType: "QB", eligiblePositions: ["QB"] },
  { slotType: "RB", eligiblePositions: ["RB"] },
  { slotType: "RB", eligiblePositions: ["RB"] },
  { slotType: "WR", eligiblePositions: ["WR"] },
  { slotType: "WR", eligiblePositions: ["WR"] },
  { slotType: "WR", eligiblePositions: ["WR"] },
  { slotType: "TE", eligiblePositions: ["TE"] },
  { slotType: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
  { slotType: "K", eligiblePositions: ["K"] },
  { slotType: "DEF", eligiblePositions: ["DEF"] },
];

const POSITION_CYCLE = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

function buildRoster(count: number): RecommendLineupPlayer[] {
  const players: RecommendLineupPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const position = POSITION_CYCLE[i % POSITION_CYCLE.length];
    players.push({
      playerId: `P${i}`,
      fantasyPositions: [position as string],
      rawValue: 5 + ((i * 7) % 20),
      status: i % 11 === 0 ? "Questionable" : null,
      isBye: false,
      kickoffUtc: "2026-09-14T20:00:00.000Z", // in the future relative to `now` below: not locked
      kickoffApproximate: false,
    });
  }
  return players;
}

describe("recommendLineup performance (LINEUP-7)", () => {
  it("completes well under the 50ms budget for a 30-player roster", () => {
    const players = buildRoster(30);
    const currentAssignment = SLOTS.map((_slot, i) => players[i]?.playerId ?? null);
    const now = new Date("2026-09-14T18:00:00.000Z");

    const durationsMs: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      recommendLineup({
        slots: SLOTS,
        slotWarnings: [],
        players,
        currentAssignment,
        now,
      });
      durationsMs.push(performance.now() - start);
    }

    const maxDuration = Math.max(...durationsMs);
    // Real margin against the 50ms spec budget (LINEUP-7), not an edge-of-flaky assertion.
    expect(maxDuration).toBeLessThan(25);
  });
});
