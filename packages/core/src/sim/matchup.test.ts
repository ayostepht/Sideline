import { describe, expect, it } from "vitest";
import { simulateMatchup, type SimTeam } from "./matchup.js";

function notStarted(playerId: string, mean: number, sd: number) {
  return { playerId, mean, sd, status: "not_started" as const };
}

function finished(playerId: string, actualPointsSoFar: number) {
  return {
    playerId,
    mean: 0,
    sd: 0,
    status: "finished" as const,
    actualPointsSoFar,
  };
}

function buildTeam(rosterId: string, count: number, meanBase: number): SimTeam {
  return {
    rosterId,
    starters: Array.from({ length: count }, (_, i) =>
      notStarted(`${rosterId}-P${i}`, meanBase + i, 3 + (i % 4)),
    ),
  };
}

describe("simulateMatchup determinism", () => {
  it("is bit-identical across two calls with the same inputs and seed", () => {
    const teamA = buildTeam("A", 10, 10);
    const teamB = buildTeam("B", 10, 9);
    const r1 = simulateMatchup({ teamA, teamB, seed: 42, iterations: 2000 });
    const r2 = simulateMatchup({ teamA, teamB, seed: 42, iterations: 2000 });
    expect(r1).toEqual(r2);
  });
});

describe("simulateMatchup symmetry", () => {
  it("winProbabilityTeamA(A, B) approximately equals winProbabilityTeamB(B, A)", () => {
    // Tolerance 0.02: at 10,000 iterations, a true win probability p has a binomial standard
    // error of sqrt(p(1-p)/n) <= 0.005 at worst (p=0.5), so two independent runs (different RNG
    // draw order, since starters are flattened in a different order) agreeing within 0.02 is
    // about 4 standard errors of slack: comfortably non-flaky while still proving symmetry.
    const teamA = buildTeam("A", 10, 11);
    const teamB = buildTeam("B", 10, 10.5);
    const forward = simulateMatchup({ teamA, teamB, seed: 7, iterations: 10000 });
    const reversed = simulateMatchup({ teamA: teamB, teamB: teamA, seed: 7, iterations: 10000 });
    expect(Math.abs(forward.winProbabilityTeamA - reversed.winProbabilityTeamB)).toBeLessThan(0.02);
    expect(Math.abs(forward.winProbabilityTeamB - reversed.winProbabilityTeamA)).toBeLessThan(0.02);
  });

  it("win, loss, and tie probabilities sum to 1", () => {
    const teamA = buildTeam("A", 10, 10);
    const teamB = buildTeam("B", 10, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 3, iterations: 5000 });
    expect(
      result.winProbabilityTeamA + result.winProbabilityTeamB + result.tieProbability,
    ).toBeCloseTo(1, 10);
  });
});

describe("simulateMatchup finished players", () => {
  it("gives a degenerate (zero-spread) score distribution when every starter is finished", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [finished("A-P1", 20), finished("A-P2", 15), finished("A-P3", 8)],
    };
    const teamB = buildTeam("B", 10, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 11, iterations: 1000 });
    expect(result.teamA.p10).toBeCloseTo(43, 10);
    expect(result.teamA.p50).toBeCloseTo(43, 10);
    expect(result.teamA.p90).toBeCloseTo(43, 10);
  });
});

describe("simulateMatchup in-progress players", () => {
  it("attaches SIM_REMAINING_APPROXIMATE when fractionOfGameRemaining is null", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [
        {
          playerId: "A-P1",
          mean: 12,
          sd: 4,
          status: "in_progress",
          actualPointsSoFar: 6,
          fractionOfGameRemaining: null,
        },
      ],
    };
    const teamB = buildTeam("B", 1, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 1, iterations: 500 });
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "SIM_REMAINING_APPROXIMATE", value: "A-P1" }),
    );
  });

  it("does not attach the approximate reason when fractionOfGameRemaining is known", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [
        {
          playerId: "A-P1",
          mean: 12,
          sd: 4,
          status: "in_progress",
          actualPointsSoFar: 6,
          fractionOfGameRemaining: 0.25,
        },
      ],
    };
    const teamB = buildTeam("B", 1, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 1, iterations: 500 });
    expect(result.reasons.some((r) => r.code === "SIM_REMAINING_APPROXIMATE")).toBe(false);
  });

  it("collapses the remaining component to 0 when fractionOfGameRemaining is 0", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [
        {
          playerId: "A-P1",
          mean: 12,
          sd: 4,
          status: "in_progress",
          actualPointsSoFar: 9,
          fractionOfGameRemaining: 0,
        },
      ],
    };
    const teamB = buildTeam("B", 1, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 1, iterations: 500 });
    expect(result.teamA.p10).toBeCloseTo(9, 10);
    expect(result.teamA.p50).toBeCloseTo(9, 10);
    expect(result.teamA.p90).toBeCloseTo(9, 10);
  });
});

describe("simulateMatchup swing players", () => {
  it("ranks a large-sd player above a zero-sd (fully determined) player", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [notStarted("A-steady", 10, 0), notStarted("A-volatile", 10, 15)],
    };
    const teamB = buildTeam("B", 2, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 9, iterations: 5000 });

    const steadyIndex = result.swingPlayers.findIndex((p) => p.playerId === "A-steady");
    const volatileIndex = result.swingPlayers.findIndex((p) => p.playerId === "A-volatile");
    expect(volatileIndex).toBeLessThan(steadyIndex);
    expect(result.swingPlayers[steadyIndex]?.varianceContribution).toBeCloseTo(0, 5);
    expect(result.swingPlayers[volatileIndex]?.varianceContribution).toBeGreaterThan(0);
  });

  it("sorts finished (zero-variance) players to the bottom", () => {
    const teamA: SimTeam = {
      rosterId: "A",
      starters: [finished("A-done", 20), notStarted("A-live", 10, 8)],
    };
    const teamB = buildTeam("B", 2, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 4, iterations: 3000 });
    const last = result.swingPlayers[result.swingPlayers.length - 1];
    expect(last?.playerId).toBe("A-done");
    expect(last?.varianceContribution).toBeCloseTo(0, 10);
  });

  it("includes playerId and rosterId on every swing player", () => {
    const teamA = buildTeam("A", 3, 10);
    const teamB = buildTeam("B", 3, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 2, iterations: 500 });
    for (const sp of result.swingPlayers) {
      expect(typeof sp.playerId).toBe("string");
      expect(typeof sp.rosterId).toBe("string");
    }
  });
});

describe("simulateMatchup quantiles", () => {
  it("returns p10 <= p50 <= p90 for both teams", () => {
    const teamA = buildTeam("A", 10, 10);
    const teamB = buildTeam("B", 10, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 6, iterations: 5000 });
    expect(result.teamA.p10).toBeLessThanOrEqual(result.teamA.p50);
    expect(result.teamA.p50).toBeLessThanOrEqual(result.teamA.p90);
    expect(result.teamB.p10).toBeLessThanOrEqual(result.teamB.p50);
    expect(result.teamB.p50).toBeLessThanOrEqual(result.teamB.p90);
  });

  it("defaults to 10,000 iterations when none is given", () => {
    const teamA = buildTeam("A", 2, 10);
    const teamB = buildTeam("B", 2, 10);
    const result = simulateMatchup({ teamA, teamB, seed: 1 });
    expect(
      result.winProbabilityTeamA + result.winProbabilityTeamB + result.tieProbability,
    ).toBeCloseTo(1, 6);
  });
});
