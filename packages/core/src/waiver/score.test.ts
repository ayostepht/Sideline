import { describe, expect, it } from "vitest";
import {
  computeWaiverScore,
  DEFAULT_WAIVER_SCORE_WEIGHTS,
  WAIVER_SCORE_WEIGHT_SUM_EPSILON,
  type WaiverScoreInput,
} from "./score.js";

const ALL_FIFTY: Omit<WaiverScoreInput, "weights"> = {
  lineupImpactPercentile: 50,
  rosValuePercentile: 50,
  usageTrendPercentile: 50,
  momentumPercentile: 50,
  schedulePercentile: 50,
};

describe("computeWaiverScore", () => {
  it("averages to 50 when every percentile is 50 under default weights (0.4+0.2+0.2+0.1+0.1 = 1.0)", () => {
    const result = computeWaiverScore(ALL_FIFTY);
    expect(result.score).toBeCloseTo(50, 10);
    expect(result.reasons).toHaveLength(5);
  });

  it("weights Lineup Impact at 100 and the rest at 0 down to exactly the Lineup Impact weight (0.4 * 100 = 40)", () => {
    const result = computeWaiverScore({
      lineupImpactPercentile: 100,
      rosValuePercentile: 0,
      usageTrendPercentile: 0,
      momentumPercentile: 0,
      schedulePercentile: 0,
    });
    expect(result.score).toBeCloseTo(40, 10);
  });

  it("weights ROS value at 100 and the rest at 0 down to the ROS weight (0.2 * 100 = 20)", () => {
    const result = computeWaiverScore({
      lineupImpactPercentile: 0,
      rosValuePercentile: 100,
      usageTrendPercentile: 0,
      momentumPercentile: 0,
      schedulePercentile: 0,
    });
    expect(result.score).toBeCloseTo(20, 10);
  });

  it("sums every component at 100 to exactly 100", () => {
    const result = computeWaiverScore({
      lineupImpactPercentile: 100,
      rosValuePercentile: 100,
      usageTrendPercentile: 100,
      momentumPercentile: 100,
      schedulePercentile: 100,
    });
    expect(result.score).toBeCloseTo(100, 10);
  });

  it("produces exactly one reason chip per weighted component (5), each with the percentile value and its weighted impact", () => {
    const result = computeWaiverScore(ALL_FIFTY);
    expect(result.reasons).toHaveLength(5);

    const byCode = new Map(result.reasons.map((reason) => [reason.code, reason]));
    expect(byCode.get("WAIVER_SCORE_LINEUP_IMPACT")).toMatchObject({ value: 50, impact: 20 });
    expect(byCode.get("WAIVER_SCORE_ROS_VALUE")).toMatchObject({ value: 50, impact: 10 });
    expect(byCode.get("WAIVER_SCORE_USAGE_TREND")).toMatchObject({ value: 50, impact: 10 });
    expect(byCode.get("WAIVER_SCORE_MOMENTUM")).toMatchObject({ value: 50, impact: 5 });
    expect(byCode.get("WAIVER_SCORE_SCHEDULE")).toMatchObject({ value: 50, impact: 5 });
  });

  it("honors custom weights that sum to 1.0", () => {
    const result = computeWaiverScore({
      ...ALL_FIFTY,
      weights: {
        lineupImpact: 1,
        rosValue: 0,
        usageTrend: 0,
        momentum: 0,
        schedule: 0,
      },
    });
    expect(result.score).toBeCloseTo(50, 10);
  });

  it("accepts the default weight set's own floating-point sum without throwing", () => {
    expect(() =>
      computeWaiverScore({ ...ALL_FIFTY, weights: DEFAULT_WAIVER_SCORE_WEIGHTS }),
    ).not.toThrow();
  });

  it("throws when custom weights do not sum to 1.0 within the documented epsilon", () => {
    expect(() =>
      computeWaiverScore({
        ...ALL_FIFTY,
        weights: {
          lineupImpact: 0.5,
          rosValue: 0.2,
          usageTrend: 0.2,
          momentum: 0.1,
          schedule: 0.1,
        },
      }),
    ).toThrow(/sum to 1\.0/);
  });

  it("does not throw for a weight sum within the documented epsilon of 1.0", () => {
    expect(() =>
      computeWaiverScore({
        ...ALL_FIFTY,
        weights: {
          lineupImpact: 0.4 + WAIVER_SCORE_WEIGHT_SUM_EPSILON / 2,
          rosValue: 0.2,
          usageTrend: 0.2,
          momentum: 0.1,
          schedule: 0.1,
        },
      }),
    ).not.toThrow();
  });

  it("clamps an out-of-range percentile (above 100) and adds a clamp reason citing the original value", () => {
    const result = computeWaiverScore({ ...ALL_FIFTY, lineupImpactPercentile: 150 });

    const clampReason = result.reasons.find(
      (reason) => reason.code === "WAIVER_SCORE_PERCENTILE_CLAMPED",
    );
    expect(clampReason?.value).toBe(150);

    const componentReason = result.reasons.find(
      (reason) => reason.code === "WAIVER_SCORE_LINEUP_IMPACT",
    );
    expect(componentReason).toMatchObject({ value: 100, impact: 40 });
    expect(result.reasons).toHaveLength(6);
  });

  it("clamps an out-of-range percentile (below 0) and adds a clamp reason citing the original value", () => {
    const result = computeWaiverScore({ ...ALL_FIFTY, rosValuePercentile: -10 });

    const clampReason = result.reasons.find(
      (reason) => reason.code === "WAIVER_SCORE_PERCENTILE_CLAMPED",
    );
    expect(clampReason?.value).toBe(-10);

    const componentReason = result.reasons.find(
      (reason) => reason.code === "WAIVER_SCORE_ROS_VALUE",
    );
    expect(componentReason).toMatchObject({ value: 0, impact: 0 });
  });
});
