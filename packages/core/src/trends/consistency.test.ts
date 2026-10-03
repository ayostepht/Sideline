import { describe, expect, it } from "vitest";
import { computeConsistency } from "./consistency.js";

describe("computeConsistency (TREND-3)", () => {
  it("0 weeks: cv 0, no weeks, NO_GAMES_PLAYED reason", () => {
    const result = computeConsistency({ weeks: [], startableCount: 12 });
    expect(result.cv).toBe(0);
    expect(result.weeks).toEqual([]);
    expect(result.boomCount).toBe(0);
    expect(result.bustCount).toBe(0);
    expect(result.reasons).toEqual([expect.objectContaining({ code: "TREND_CV_NO_GAMES_PLAYED" })]);
  });

  it("computes the population CV across weekly points", () => {
    // points = [10, 20, 30]: mean = 20, sd = sqrt(200/3) ~= 8.16496580927726
    // cv = sd / mean ~= 0.4082482904638631
    const result = computeConsistency({
      weeks: [
        { week: 1, actualPts: 10, positionRank: 5 },
        { week: 2, actualPts: 20, positionRank: 5 },
        { week: 3, actualPts: 30, positionRank: 5 },
      ],
      startableCount: 12,
    });
    expect(result.cv).toBeCloseTo(0.4082482904638631, 10);
    expect(result.reasons).toEqual([]);
  });

  it("zero mean points produces cv 0 with ZERO_MEAN reason", () => {
    const result = computeConsistency({
      weeks: [
        { week: 1, actualPts: 0, positionRank: 20 },
        { week: 2, actualPts: 0, positionRank: 20 },
      ],
      startableCount: 12,
    });
    expect(result.cv).toBe(0);
    expect(result.reasons).toEqual([expect.objectContaining({ code: "TREND_CV_ZERO_MEAN" })]);
  });

  it("fewer than 2 weeks adds a small-sample reason", () => {
    const result = computeConsistency({
      weeks: [{ week: 1, actualPts: 15, positionRank: 1 }],
      startableCount: 12,
    });
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_CV_SMALL_SAMPLE", value: 1 }),
    ]);
  });

  it("boom/bust boundary: rank exactly N is a boom, rank exactly 1 past N is not", () => {
    const N = 12;
    const result = computeConsistency({
      weeks: [
        { week: 1, actualPts: 10, positionRank: N }, // exactly N -> boom
        { week: 2, actualPts: 10, positionRank: N + 1 }, // just past N -> not boom
      ],
      startableCount: N,
    });
    expect(result.weeks[0]?.isBoom).toBe(true);
    expect(result.weeks[0]?.isBust).toBe(false);
    expect(result.weeks[1]?.isBoom).toBe(false);
  });

  it("boom/bust boundary: rank exactly 1.5*N is NOT a bust, rank just past 1.5*N IS a bust", () => {
    const N = 12;
    const threshold = 1.5 * N; // 18
    const result = computeConsistency({
      weeks: [
        { week: 1, actualPts: 5, positionRank: threshold }, // exactly 1.5N -> not bust
        { week: 2, actualPts: 5, positionRank: threshold + 1 }, // past 1.5N -> bust
      ],
      startableCount: N,
    });
    expect(result.weeks[0]?.isBust).toBe(false);
    expect(result.weeks[1]?.isBust).toBe(true);
  });

  it("N=1: only rank 1 is a boom, and anything rank 2 or worse is a bust (1.5*1=1.5)", () => {
    const result = computeConsistency({
      weeks: [
        { week: 1, actualPts: 30, positionRank: 1 },
        { week: 2, actualPts: 10, positionRank: 2 },
      ],
      startableCount: 1,
    });
    expect(result.weeks[0]?.isBoom).toBe(true);
    expect(result.weeks[0]?.isBust).toBe(false);
    expect(result.weeks[1]?.isBoom).toBe(false);
    expect(result.weeks[1]?.isBust).toBe(true);
    expect(result.boomCount).toBe(1);
    expect(result.bustCount).toBe(1);
  });

  it("startableCount <= 0 is guarded: no boom/bust flags, INVALID_STARTABLE_COUNT reason", () => {
    const result = computeConsistency({
      weeks: [{ week: 1, actualPts: 10, positionRank: 1 }],
      startableCount: 0,
    });
    expect(result.weeks[0]?.isBoom).toBe(false);
    expect(result.weeks[0]?.isBust).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TREND_INVALID_STARTABLE_COUNT", value: 0 }),
      ]),
    );
  });
});
