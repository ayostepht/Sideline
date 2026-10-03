import { describe, expect, it } from "vitest";
import { baseProjection } from "./base.js";
import { rescoreProjection } from "../scoring/rescore-projection.js";

describe("baseProjection (PROJ-1)", () => {
  it("delegates directly to rescoreProjection when stats are present", () => {
    const stats = { rec: 5, rec_yd: 60, pass_td: 2 };
    const scoringSettings = { rec: 1, rec_yd: 0.1, pass_td: 4 };
    const result = baseProjection({ stats, scoringSettings });
    const expected = rescoreProjection({ stats, scoringSettings });
    expect(result).toEqual(expected);
  });

  it("delegates an SCORE-3 exception through unchanged (fgm_50p -> fgm_50_59 rate)", () => {
    const stats = { fgm_50p: 1 };
    const scoringSettings = { fgm_50_59: 5, fgm_60p: 6 };
    const result = baseProjection({ stats, scoringSettings });
    expect(result.points).toBeCloseTo(5, 6);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "FGM_50P_FROM_FGM_50_59", value: 1, impact: 5 }),
    ]);
  });

  it("returns 0 points with a NO_PROJECTION reason when stats is undefined", () => {
    const result = baseProjection({
      stats: undefined,
      scoringSettings: { rec: 1 },
    });
    expect(result.points).toBe(0);
    expect(result.reasons).toEqual([expect.objectContaining({ code: "NO_PROJECTION", impact: 0 })]);
  });
});
