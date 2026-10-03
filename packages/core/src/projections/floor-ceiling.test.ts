import { describe, expect, it } from "vitest";
import {
  FLOOR_CEILING_EMPIRICAL_MIN_SAMPLES,
  Z_20,
  Z_80,
  floorAndCeiling,
} from "./floor-ceiling.js";

describe("floorAndCeiling (PROJ-3)", () => {
  it("uses the normal-approximation branch with fewer than 10 historical points", () => {
    // proj = 10, sd = 5
    // floor = max(0, 10 + Z_20 * 5) = max(0, 10 - 4.208106167864571) = 5.791893832135429
    // ceiling = max(0, 10 + Z_80 * 5) = max(0, 10 + 4.208106167864571) = 14.208106167864571
    const result = floorAndCeiling({
      proj: 10,
      sd: 5,
      historicalWeeklyPoints: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    expect(result.floor).toBeCloseTo(10 + Z_20 * 5, 10);
    expect(result.ceiling).toBeCloseTo(10 + Z_80 * 5, 10);
    expect(result.floor).toBeCloseTo(5.791893832135429, 10);
    expect(result.ceiling).toBeCloseTo(14.208106167864571, 10);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "FLOOR_CEILING_NORMAL_APPROX" }),
    ]);
    expect(result.reasons).toHaveLength(1);
  });

  it("uses the normal-approximation branch when historicalWeeklyPoints is omitted", () => {
    const result = floorAndCeiling({ proj: 10, sd: 5 });
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "FLOOR_CEILING_NORMAL_APPROX" }),
    ]);
  });

  it("uses the empirical branch at exactly 10 historical points", () => {
    // sorted = [1..10], n = 10
    // p20: index = 0.2 * 9 = 1.8, lower=1 (value 2), upper=2 (value 3)
    //   = 2 + (3 - 2) * 0.8 = 2.8
    // p80: index = 0.8 * 9 = 7.2, lower=7 (value 8), upper=8 (value 9)
    //   = 8 + (9 - 8) * 0.2 = 8.2
    const historicalWeeklyPoints = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(historicalWeeklyPoints).toHaveLength(FLOOR_CEILING_EMPIRICAL_MIN_SAMPLES);
    const result = floorAndCeiling({ proj: 999, sd: 999, historicalWeeklyPoints });
    expect(result.floor).toBeCloseTo(2.8, 10);
    expect(result.ceiling).toBeCloseTo(8.2, 10);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "FLOOR_CEILING_EMPIRICAL", value: 10 }),
    ]);
    expect(result.reasons).toHaveLength(1);
  });

  it("uses the empirical branch with more than 10 historical points, order-independent", () => {
    const historicalWeeklyPoints = [11, 3, 7, 1, 9, 5, 2, 10, 4, 8, 6];
    const result = floorAndCeiling({ proj: 0, sd: 0, historicalWeeklyPoints });
    // sorted = [1..11], n = 11
    // p20: index = 0.2 * 10 = 2.0 -> exact rank, value = sorted[2] = 3
    // p80: index = 0.8 * 10 = 8.0 -> exact rank, value = sorted[8] = 9
    expect(result.floor).toBeCloseTo(3, 10);
    expect(result.ceiling).toBeCloseTo(9, 10);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "FLOOR_CEILING_EMPIRICAL", value: 11 }),
    ]);
  });

  it("clamps floor to 0 when proj - sd would go negative", () => {
    // proj = 2, sd = 5: floor = 2 + Z_20 * 5 ~= -2.208 -> clamped to 0
    const result = floorAndCeiling({
      proj: 2,
      sd: 5,
      historicalWeeklyPoints: [1, 2, 3],
    });
    expect(result.floor).toBe(0);
    expect(result.reasons).toHaveLength(1);
  });
});
