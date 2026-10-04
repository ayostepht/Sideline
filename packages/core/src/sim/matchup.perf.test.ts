/**
 * SIM-3 (PLAN 5.7): 10,000 iterations for two 10-slot lineups (20 starters total) must complete
 * in under 300ms.
 */
import { describe, expect, it } from "vitest";
import { simulateMatchup, type SimStarter, type SimTeam } from "./matchup.js";

function buildStarters(prefix: string, count: number): SimStarter[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `${prefix}-P${i}`,
    mean: 8 + ((i * 3) % 20),
    sd: 2 + (i % 5),
    status: "not_started" as const,
  }));
}

describe("simulateMatchup performance (SIM-3)", () => {
  it("runs 10,000 iterations for two 10-slot lineups in under 300ms", () => {
    const teamA: SimTeam = { rosterId: "A", starters: buildStarters("A", 10) };
    const teamB: SimTeam = { rosterId: "B", starters: buildStarters("B", 10) };

    const durationsMs: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      simulateMatchup({ teamA, teamB, seed: 100 + run, iterations: 10000 });
      durationsMs.push(performance.now() - start);
    }

    // Real margin against the 300ms SIM-3 budget, not an edge-of-flaky assertion: measured runs
    // on a dev machine land around 9-10ms for 10,000 iterations x 20 starters.
    const maxDuration = Math.max(...durationsMs);
    expect(maxDuration).toBeLessThan(300);
  });
});
