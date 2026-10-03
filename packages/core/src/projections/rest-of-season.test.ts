import { describe, expect, it } from "vitest";
import { restOfSeasonProjection } from "./rest-of-season.js";

describe("restOfSeasonProjection (PROJ-4)", () => {
  it("sums real weekly projections with no estimate reason when all weeks are known", () => {
    const result = restOfSeasonProjection({
      weeks: [
        { week: 1, projectedPoints: 10 },
        { week: 2, projectedPoints: 12 },
      ],
      seasonPpg: 11,
    });
    expect(result.points).toBeCloseTo(22, 6);
    expect(result.reasons).toEqual([]);
  });

  it("falls back to season PPG for weeks with no projection, labeled as an estimate", () => {
    const result = restOfSeasonProjection({
      weeks: [
        { week: 1, projectedPoints: 10 },
        { week: 2, projectedPoints: null },
        { week: 3, projectedPoints: null },
      ],
      seasonPpg: 8,
    });
    // 10 + 8 + 8 = 26
    expect(result.points).toBeCloseTo(26, 6);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "ROS_ESTIMATED_FROM_PPG", value: 2 }),
    ]);
  });

  it("contributes 0 and flags no-data weeks when neither projection nor PPG is available", () => {
    const result = restOfSeasonProjection({
      weeks: [
        { week: 1, projectedPoints: 10 },
        { week: 2, projectedPoints: null },
      ],
      seasonPpg: null,
    });
    // week 1 = 10, week 2 has no projectedPoints and seasonPpg is null -> 0, no-data count 1
    expect(result.points).toBeCloseTo(10, 6);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "ROS_WEEK_NO_DATA", value: 1 }),
    ]);
  });

  it("applies the multiplier to both real-projection and PPG-fallback contributions", () => {
    const result = restOfSeasonProjection({
      weeks: [
        { week: 1, projectedPoints: 10, multiplier: 1.2 },
        { week: 2, projectedPoints: null, multiplier: 0.5 },
      ],
      seasonPpg: 8,
    });
    // (10 * 1.2) + (8 * 0.5) = 12 + 4 = 16
    expect(result.points).toBeCloseTo(16, 6);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "ROS_ESTIMATED_FROM_PPG", value: 1 }),
    ]);
  });

  it("returns 0 points and no reasons for an empty weeks array", () => {
    const result = restOfSeasonProjection({ weeks: [], seasonPpg: 10 });
    expect(result.points).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("treats seasonPpg null combined with a no-projection week as no-data, not estimate", () => {
    const result = restOfSeasonProjection({
      weeks: [{ week: 1, projectedPoints: null }],
      seasonPpg: null,
    });
    expect(result.points).toBe(0);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toEqual(["ROS_WEEK_NO_DATA"]);
    expect(codes).not.toContain("ROS_ESTIMATED_FROM_PPG");
  });

  it("treats default multiplier (omitted) as 1", () => {
    const result = restOfSeasonProjection({
      weeks: [{ week: 1, projectedPoints: 10 }],
      seasonPpg: null,
    });
    expect(result.points).toBeCloseTo(10, 6);
  });
});
