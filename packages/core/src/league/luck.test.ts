import { describe, expect, it } from "vitest";
import { computeLuck, luck } from "./luck.js";

describe("luck (LEAGUE-2)", () => {
  it("5 actual wins, weekly all-play win rates summing to 3.5: luck = 1.5 (overperforming)", () => {
    // [1, 1, 0.5, 0.5, 0.5] sums to 3.5
    expect(luck(5, [1, 1, 0.5, 0.5, 0.5])).toBeCloseTo(1.5, 10);
  });

  it("negative luck when actual wins trail the expected sum", () => {
    expect(luck(2, [1, 1, 1, 1])).toBeCloseTo(-2, 10);
  });

  it("zero weeks played: expected wins is 0, luck equals actual wins", () => {
    expect(luck(0, [])).toBe(0);
    expect(luck(3, [])).toBe(3);
  });

  it("exactly matching the schedule-neutral rate gives zero luck", () => {
    expect(luck(2, [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0, 10);
  });
});

describe("computeLuck (LEAGUE-2)", () => {
  it("returns the same number as luck(), plus the expectedWins breakdown", () => {
    const result = computeLuck(5, [1, 1, 0.5, 0.5, 0.5]);
    expect(result.actualWins).toBe(5);
    expect(result.expectedWins).toBeCloseTo(3.5, 10);
    expect(result.luck).toBeCloseTo(1.5, 10);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "LEAGUE_LUCK_EXPECTED_WINS" }),
    ]);
  });

  it("no weeks played yet adds a NO_WEEKS reason", () => {
    const result = computeLuck(0, []);
    expect(result.expectedWins).toBe(0);
    expect(result.luck).toBe(0);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LEAGUE_LUCK_NO_WEEKS" })]),
    );
  });
});
