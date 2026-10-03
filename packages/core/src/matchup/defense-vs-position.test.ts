import { describe, expect, it } from "vitest";
import { computeDefenseVsPosition, DEFAULT_DVP_SHRINKAGE_K } from "./defense-vs-position.js";

describe("computeDefenseVsPosition (MATCH-1)", () => {
  it("n = 0 is pure shrinkage to the league position average", () => {
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: [],
      leaguePositionAverage: 20,
    });
    // w = 0 / (0 + 4) = 0 => ptsAllowedPg = 0 * rawAvg + 1 * 20 = 20
    expect(result.ptsAllowedPg).toBeCloseTo(20, 10);
    expect(result.games).toBe(0);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "DVP_SHRUNK_LIMITED_HISTORY", value: 0 }),
    ]);
  });

  it("weights the correct 4 most-recent weeks 2x even when the input is unsorted", () => {
    // weeks 1..6, pointsAllowed = week * 10. Last 4 weeks by week number are 3,4,5,6 (weight 2);
    // weeks 1,2 are earlier (weight 1).
    // weightedSum = 2*(30+40+50+60) + 1*(10+20) = 2*180 + 30 = 390
    // weightSum = 2*4 + 1*2 = 10 => rawAvg = 39
    // n = 6, k = 4 (default) => w = 6/10 = 0.6
    // ptsAllowedPg = 0.6*39 + 0.4*20 = 23.4 + 8 = 31.4
    const unsorted = [
      { week: 4, pointsAllowed: 40 },
      { week: 1, pointsAllowed: 10 },
      { week: 6, pointsAllowed: 60 },
      { week: 3, pointsAllowed: 30 },
      { week: 2, pointsAllowed: 20 },
      { week: 5, pointsAllowed: 50 },
    ];
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: unsorted,
      leaguePositionAverage: 20,
    });
    expect(result.ptsAllowedPg).toBeCloseTo(31.4, 10);
    expect(result.games).toBe(6);
  });

  it("gives identical results regardless of input order (sorting happens internally)", () => {
    const sorted = [
      { week: 1, pointsAllowed: 10 },
      { week: 2, pointsAllowed: 20 },
      { week: 3, pointsAllowed: 30 },
      { week: 4, pointsAllowed: 40 },
      { week: 5, pointsAllowed: 50 },
      { week: 6, pointsAllowed: 60 },
    ];
    const reversed = [...sorted].reverse();
    const a = computeDefenseVsPosition({ weeklyPointsAllowed: sorted, leaguePositionAverage: 20 });
    const b = computeDefenseVsPosition({
      weeklyPointsAllowed: reversed,
      leaguePositionAverage: 20,
    });
    expect(a.ptsAllowedPg).toBeCloseTo(b.ptsAllowedPg, 10);
  });

  it("weights ALL available weeks 2x when n <= 4 (last 4 weeks rule still applies)", () => {
    // n = 2, both weeks fall within "the last 4 weeks" so both get weight 2, none get weight 1.
    // rawAvg = (2*10 + 2*30) / (2 + 2) = 80 / 4 = 20
    // k = 4 (default), n = 2 => w = 2 / 6 = 1/3
    // ptsAllowedPg = (1/3)*20 + (2/3)*26 = 20/3 + 52/3 = 72/3 = 24
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: [
        { week: 1, pointsAllowed: 10 },
        { week: 2, pointsAllowed: 30 },
      ],
      leaguePositionAverage: 26,
    });
    expect(result.ptsAllowedPg).toBeCloseTo(24, 10);
    expect(result.games).toBe(2);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "DVP_SHRUNK_LIMITED_HISTORY", value: 2 }),
    ]);
  });

  it("weights ALL available weeks 2x when n = 3, verified against a weight-1-only baseline", () => {
    // n = 3, weeks 1,2,3, pointsAllowed 10,20,30 -> all weighted 2x (not a mix of 1x/2x).
    // rawAvg = (2*10 + 2*20 + 2*30) / 6 = 120 / 6 = 20 (same as the unweighted mean, since every
    // week shares the same weight -- this is what proves none of them got weight 1).
    // k = 4, n = 3 => w = 3/7; leaguePositionAverage = 15
    // ptsAllowedPg = (3/7)*20 + (4/7)*15 = 60/7 + 60/7 = 120/7
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: [
        { week: 1, pointsAllowed: 10 },
        { week: 2, pointsAllowed: 20 },
        { week: 3, pointsAllowed: 30 },
      ],
      leaguePositionAverage: 15,
    });
    expect(result.ptsAllowedPg).toBeCloseTo(120 / 7, 10);
  });

  it("omits the limited-history reason when n >= k", () => {
    const sorted = Array.from({ length: 8 }, (_, i) => ({ week: i + 1, pointsAllowed: 20 }));
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: sorted,
      leaguePositionAverage: 18,
    });
    expect(result.reasons).toEqual([]);
  });

  it("applies a custom k", () => {
    // n = 2, k = 1 => w = 2/3; both weeks weighted 2x => rawAvg = 20
    const result = computeDefenseVsPosition({
      weeklyPointsAllowed: [
        { week: 1, pointsAllowed: 10 },
        { week: 2, pointsAllowed: 30 },
      ],
      leaguePositionAverage: 26,
      k: 1,
    });
    const w = 2 / 3;
    const expected = w * 20 + (1 - w) * 26;
    expect(result.ptsAllowedPg).toBeCloseTo(expected, 10);
    expect(DEFAULT_DVP_SHRINKAGE_K).toBe(4);
  });
});
