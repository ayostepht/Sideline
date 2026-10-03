import { describe, expect, it } from "vitest";
import { DEFAULT_VARIANCE_SHRINKAGE_K, weeklyStandardDeviation } from "./variance.js";

describe("weeklyStandardDeviation (PROJ-2)", () => {
  it("computes the population standard deviation and shrinks it toward the position prior", () => {
    // weeklyPoints = [10, 20, 30]: mean = 20, squared deviations = 100, 0, 100, sum = 200,
    // population variance = 200 / 3, sdPlayer = sqrt(200/3) ~= 8.16496580927726
    // n = 3, k = 6 (default) => w = 3 / (3 + 6) = 1/3
    // prior term = positionCv * proj = 0.4 * 15 = 6
    // sd = (1/3) * 8.16496580927726 + (2/3) * 6 ~= 6.721655269759088
    const result = weeklyStandardDeviation({
      weeklyPoints: [10, 20, 30],
      positionCv: 0.4,
      proj: 15,
    });
    expect(result.sd).toBeCloseTo(6.721655269759088, 10);
  });

  it("n = 0 is pure prior: sd = positionCv * proj, with the limited-history reason present", () => {
    const result = weeklyStandardDeviation({
      weeklyPoints: [],
      positionCv: 0.5,
      proj: 20,
    });
    expect(result.sd).toBeCloseTo(0.5 * 20, 10);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "VARIANCE_SHRUNK_LIMITED_HISTORY", value: 0 }),
    ]);
  });

  it("applies the default k = 6 when omitted", () => {
    const withDefault = weeklyStandardDeviation({
      weeklyPoints: [5, 10, 15, 20],
      positionCv: 0.3,
      proj: 12,
    });
    const withExplicitSix = weeklyStandardDeviation({
      weeklyPoints: [5, 10, 15, 20],
      positionCv: 0.3,
      proj: 12,
      k: DEFAULT_VARIANCE_SHRINKAGE_K,
    });
    expect(withDefault.sd).toBeCloseTo(withExplicitSix.sd, 12);
    expect(DEFAULT_VARIANCE_SHRINKAGE_K).toBe(6);
  });

  it("applies a custom k", () => {
    // n = 4, k = 2 => w = 4 / 6 = 2/3
    const weeklyPoints = [8, 8, 8, 8]; // sdPlayer = 0
    const result = weeklyStandardDeviation({
      weeklyPoints,
      positionCv: 0.25,
      proj: 10,
      k: 2,
    });
    const w = 4 / 6;
    const expected = w * 0 + (1 - w) * 0.25 * 10;
    expect(result.sd).toBeCloseTo(expected, 10);
  });

  it("omits the reason when n >= k (shrinkage not dominated by the prior)", () => {
    // n = 10 > k = 6
    const weeklyPoints = Array.from({ length: 10 }, (_, i) => 10 + i);
    const result = weeklyStandardDeviation({
      weeklyPoints,
      positionCv: 0.3,
      proj: 15,
    });
    expect(result.reasons).toEqual([]);
  });

  it("includes the reason when n < k", () => {
    const result = weeklyStandardDeviation({
      weeklyPoints: [12, 18, 15],
      positionCv: 0.3,
      proj: 15,
      k: 6,
    });
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "VARIANCE_SHRUNK_LIMITED_HISTORY", value: 3 }),
    ]);
  });

  it("never returns a negative sd", () => {
    const result = weeklyStandardDeviation({
      weeklyPoints: [],
      positionCv: -1,
      proj: 10,
    });
    expect(result.sd).toBe(0);
  });
});
