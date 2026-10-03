import { describe, expect, it } from "vitest";
import { TREND_L3_WINDOW, computeScoringTrend } from "./scoring-trend.js";

describe("computeScoringTrend (TREND-1)", () => {
  it("0 weeks: everything null, NO_GAMES_PLAYED reason", () => {
    const result = computeScoringTrend({ weeklyPoints: [] });
    expect(result.seasonPpg).toBeNull();
    expect(result.l3Ppg).toBeNull();
    expect(result.l3Delta).toBeNull();
    expect(result.gamesPlayed).toBe(0);
    expect(result.weeklySeries).toEqual([]);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_NO_GAMES_PLAYED", value: 0 }),
    ]);
  });

  it("1 week: season PPG equals L3 PPG equals that week's points, delta 0, small-sample reason", () => {
    const result = computeScoringTrend({ weeklyPoints: [{ week: 1, actualPts: 20 }] });
    expect(result.seasonPpg).toBe(20);
    expect(result.l3Ppg).toBe(20);
    expect(result.l3Delta).toBe(0);
    expect(result.gamesPlayed).toBe(1);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_L3_SMALL_SAMPLE", value: 1 }),
    ]);
  });

  it("2 weeks: L3 uses both available weeks, small-sample reason present", () => {
    // seasonPpg = (10+20)/2 = 15; l3 uses both weeks (n=2 < 3) => l3Ppg = 15, delta = 0
    const result = computeScoringTrend({
      weeklyPoints: [
        { week: 2, actualPts: 20 },
        { week: 1, actualPts: 10 },
      ],
    });
    expect(result.seasonPpg).toBe(15);
    expect(result.l3Ppg).toBe(15);
    expect(result.l3Delta).toBe(0);
    expect(result.weeklySeries).toEqual([
      { week: 1, actualPts: 10 },
      { week: 2, actualPts: 20 },
    ]);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_L3_SMALL_SAMPLE", value: 2 }),
    ]);
  });

  it("3+ weeks: L3 uses only the last 3 weeks by week number, no small-sample reason", () => {
    // weeks 1..5 with points 10,10,10,30,30: seasonPpg = 90/5 = 18
    // l3 = last 3 weeks (3,4,5) = (10+30+30)/3 = 70/3 ~= 23.3333..., delta = 70/3 - 18
    const result = computeScoringTrend({
      weeklyPoints: [
        { week: 1, actualPts: 10 },
        { week: 2, actualPts: 10 },
        { week: 3, actualPts: 10 },
        { week: 4, actualPts: 30 },
        { week: 5, actualPts: 30 },
      ],
    });
    expect(result.seasonPpg).toBeCloseTo(18, 10);
    expect(result.l3Ppg).toBeCloseTo(70 / 3, 10);
    expect(result.l3Delta).toBeCloseTo(70 / 3 - 18, 10);
    expect(result.gamesPlayed).toBe(5);
    expect(result.reasons).toEqual([]);
    expect(TREND_L3_WINDOW).toBe(3);
  });

  it("sorts an out-of-order input series ascending by week", () => {
    const result = computeScoringTrend({
      weeklyPoints: [
        { week: 3, actualPts: 5 },
        { week: 1, actualPts: 1 },
        { week: 2, actualPts: 2 },
      ],
    });
    expect(result.weeklySeries.map((w) => w.week)).toEqual([1, 2, 3]);
  });
});
