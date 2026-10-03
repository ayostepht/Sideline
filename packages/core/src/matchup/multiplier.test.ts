import { describe, expect, it } from "vitest";
import { matchupMultiplier, MULTIPLIER_MAX, MULTIPLIER_MIN } from "./multiplier.js";

describe("matchupMultiplier (MATCH-2)", () => {
  it("computes the alpha-only term", () => {
    // m = 1 + 0.3 * (25/20 - 1) = 1 + 0.3*0.25 = 1.075
    const result = matchupMultiplier({ dvpOppPos: 25, avgPos: 20, alpha: 0.3 });
    expect(result.multiplier).toBeCloseTo(1.075, 10);
    expect(result.reasons).toEqual([]);
  });

  it("adds the optional implied-total beta term when all three fields are provided", () => {
    // term1 = 0.3 * (25/20 - 1) = 0.075
    // term2 = 0.2 * (24/22 - 1) = 0.2 * (2/22) = 0.0181818...
    // m = 1 + 0.075 + 0.018181818... = 1.093181818...
    const result = matchupMultiplier({
      dvpOppPos: 25,
      avgPos: 20,
      alpha: 0.3,
      impliedTeamTotal: 24,
      leagueAvgTotal: 22,
      beta: 0.2,
    });
    expect(result.multiplier).toBeCloseTo(1 + 0.075 + (0.2 * 2) / 22, 10);
    expect(result.reasons).toEqual([]);
  });

  it("skips the beta term when leagueAvgTotal is 0 (guards divide-by-zero)", () => {
    const result = matchupMultiplier({
      dvpOppPos: 25,
      avgPos: 20,
      alpha: 0.3,
      impliedTeamTotal: 24,
      leagueAvgTotal: 0,
      beta: 0.2,
    });
    expect(result.multiplier).toBeCloseTo(1.075, 10);
  });

  it("skips the beta term entirely when beta is not provided", () => {
    const result = matchupMultiplier({
      dvpOppPos: 25,
      avgPos: 20,
      alpha: 0.3,
      impliedTeamTotal: 24,
      leagueAvgTotal: 22,
    });
    expect(result.multiplier).toBeCloseTo(1.075, 10);
  });

  it("guards avgPos === 0: the matchup term contributes 0 and a reason is attached", () => {
    const result = matchupMultiplier({ dvpOppPos: 25, avgPos: 0, alpha: 0.5 });
    expect(result.multiplier).toBe(1);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "MATCHUP_AVG_POS_UNAVAILABLE", value: 0 }),
    ]);
  });

  it("clamps at the low end and reports the pre-clamp value", () => {
    // m = 1 + 2 * (0/20 - 1) = 1 - 2 = -1, clamped to MULTIPLIER_MIN
    const result = matchupMultiplier({ dvpOppPos: 0, avgPos: 20, alpha: 2 });
    expect(result.multiplier).toBe(MULTIPLIER_MIN);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "MATCHUP_MULTIPLIER_CLAMPED", value: -1 }),
    ]);
  });

  it("clamps at the high end and reports the pre-clamp value", () => {
    // m = 1 + 2 * (40/20 - 1) = 1 + 2 = 3, clamped to MULTIPLIER_MAX
    const result = matchupMultiplier({ dvpOppPos: 40, avgPos: 20, alpha: 2 });
    expect(result.multiplier).toBe(MULTIPLIER_MAX);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "MATCHUP_MULTIPLIER_CLAMPED", value: 3 }),
    ]);
  });

  it("does not attach the clamped reason when the value is already in range", () => {
    const result = matchupMultiplier({ dvpOppPos: 25, avgPos: 20, alpha: 0.3 });
    expect(result.multiplier).toBeGreaterThanOrEqual(MULTIPLIER_MIN);
    expect(result.multiplier).toBeLessThanOrEqual(MULTIPLIER_MAX);
    expect(result.reasons.some((r) => r.code === "MATCHUP_MULTIPLIER_CLAMPED")).toBe(false);
  });
});
