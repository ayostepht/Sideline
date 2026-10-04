import { describe, expect, it } from "vitest";
import {
  POWER_SCORE_WEIGHTS,
  computePowerScore,
  minMaxNormalize,
  powerScore,
} from "./power-score.js";

describe("powerScore / computePowerScore (LEAGUE-3)", () => {
  it("weights sum to 1", () => {
    const sum =
      POWER_SCORE_WEIGHTS.allPlay +
      POWER_SCORE_WEIGHTS.recentPointsFor +
      POWER_SCORE_WEIGHTS.rosterStrength;
    expect(sum).toBeCloseTo(1, 10);
  });

  it("all-play extreme alone (1.0, 0, 0) returns exactly the all-play weight, 0.4", () => {
    const score = powerScore({
      allPlayWinRate: 1.0,
      recentPointsForNormalized: 0,
      rosterStrengthNormalized: 0,
    });
    expect(score).toBe(0.4);
  });

  it("all three components maxed returns exactly 1.0", () => {
    const score = powerScore({
      allPlayWinRate: 1.0,
      recentPointsForNormalized: 1.0,
      rosterStrengthNormalized: 1.0,
    });
    expect(score).toBeCloseTo(1.0, 10);
  });

  it("all three components at 0 returns exactly 0", () => {
    const score = powerScore({
      allPlayWinRate: 0,
      recentPointsForNormalized: 0,
      rosterStrengthNormalized: 0,
    });
    expect(score).toBe(0);
  });

  it("computePowerScore returns the same number as powerScore, with a 3-item reasons breakdown", () => {
    const components = {
      allPlayWinRate: 0.5,
      recentPointsForNormalized: 0.25,
      rosterStrengthNormalized: 0.75,
    };
    const result = computePowerScore(components);
    expect(result.powerScore).toBeCloseTo(powerScore(components), 10);
    expect(result.reasons).toHaveLength(3);
    expect(result.reasons.map((r) => r.code)).toEqual([
      "LEAGUE_POWER_SCORE_ALL_PLAY",
      "LEAGUE_POWER_SCORE_RECENT_POINTS",
      "LEAGUE_POWER_SCORE_ROSTER_STRENGTH",
    ]);
  });
});

describe("minMaxNormalize", () => {
  it("maps the list's min to 0 and max to 1", () => {
    const result = minMaxNormalize([10, 20, 30, 40]);
    expect(result[0]).toBe(0);
    expect(result[3]).toBe(1);
  });

  it("a value equal to the median of a symmetric list maps to 0.5", () => {
    // symmetric around 20: [0, 20, 40] -> min 0, max 40, median 20 -> (20-0)/40 = 0.5
    const result = minMaxNormalize([0, 20, 40]);
    expect(result[1]).toBeCloseTo(0.5, 10);
  });

  it("interpolates linearly between min and max", () => {
    const result = minMaxNormalize([0, 25, 50, 100]);
    expect(result).toEqual([0, 0.25, 0.5, 1]);
  });

  it("degenerate list (all values equal) maps every value to 0.5, not NaN", () => {
    expect(minMaxNormalize([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  it("single-element list maps to 0.5", () => {
    expect(minMaxNormalize([7])).toEqual([0.5]);
  });

  it("empty list returns an empty list", () => {
    expect(minMaxNormalize([])).toEqual([]);
  });
});
