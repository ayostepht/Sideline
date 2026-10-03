import { describe, expect, it } from "vitest";
import { scoreStatLine } from "./score.js";
import { defPointsAllowedBucket, rescoreProjection } from "./rescore-projection.js";

describe("defPointsAllowedBucket", () => {
  it("floors the mean before bucketing (20.5 maps to pts_allow_14_20, section 4.2 example)", () => {
    expect(defPointsAllowedBucket(20.5)).toBe("pts_allow_14_20");
  });
  it.each([
    [0, "pts_allow_0"],
    [0.9, "pts_allow_0"],
    [1, "pts_allow_1_6"],
    [6.9, "pts_allow_1_6"],
    [7, "pts_allow_7_13"],
    [13.9, "pts_allow_7_13"],
    [14, "pts_allow_14_20"],
    [21, "pts_allow_21_27"],
    [28, "pts_allow_28_34"],
    [34.99, "pts_allow_28_34"],
    [35, "pts_allow_35p"],
    [50, "pts_allow_35p"],
  ])("maps mean %s to %s", (mean, expected) => {
    expect(defPointsAllowedBucket(mean)).toBe(expected);
  });
  it("floors negative means to the 0 bucket (should not occur in real data)", () => {
    expect(defPointsAllowedBucket(-3)).toBe("pts_allow_0");
  });
});

describe("rescoreProjection (SCORE-3)", () => {
  it("keys present on both sides with no exceptions: matches plain scoreStatLine", () => {
    const stats = { rec: 5, rec_yd: 60, pass_td: 2 };
    const scoringSettings = { rec: 1, rec_yd: 0.1, pass_td: 4 };
    const result = rescoreProjection({ stats, scoringSettings });
    expect(result.points).toBeCloseTo(scoreStatLine(stats, scoringSettings), 6);
    expect(result.reasons).toEqual([]);
  });

  it("keys missing on one side contribute 0, no reason (not a documented exception)", () => {
    const stats = { rec: 5 };
    const scoringSettings = { rec: 1, rec_td: 6 };
    const result = rescoreProjection({ stats, scoringSettings });
    expect(result.points).toBeCloseTo(5, 6);
    expect(result.reasons).toEqual([]);
  });

  describe("fgm_50p exception", () => {
    it("scores the combined fgm_50p projection count at the fgm_50_59 rate", () => {
      const stats = { fgm_50p: 1 };
      const scoringSettings = { fgm_50_59: 5, fgm_60p: 6 };
      const result = rescoreProjection({ stats, scoringSettings });
      // base scoreStatLine contributes 0 (fgm_50_59/fgm_60p absent from stats); exception adds
      // 1 * 5 = 5.
      expect(result.points).toBeCloseTo(5, 6);
      expect(result.reasons).toEqual([
        expect.objectContaining({ code: "FGM_50P_FROM_FGM_50_59", value: 1, impact: 5 }),
      ]);
    });

    it("does not fire when the split bucket is already present (real stats row, no double count)", () => {
      const stats = { fgm_50p: 1, fgm_50_59: 1 };
      const scoringSettings = { fgm_50_59: 5, fgm_60p: 6 };
      const result = rescoreProjection({ stats, scoringSettings });
      // Plain formula scores fgm_50_59 (1 * 5 = 5) and ignores the unmatched fgm_50p key.
      expect(result.points).toBeCloseTo(5, 6);
      expect(result.reasons).toEqual([]);
    });

    it("does not fire when the league scores fgm_50p directly (no split, no exception needed)", () => {
      const stats = { fgm_50p: 1 };
      const scoringSettings = { fgm_50p: 5 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(5, 6);
      expect(result.reasons).toEqual([]);
    });
  });

  describe("fgmiss exception", () => {
    it("computes fga - fgm when both are present", () => {
      const stats = { fga: 3, fgm: 2 };
      const scoringSettings = { fgmiss: -1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(-1, 6); // 1 miss * -1
      expect(result.reasons).toEqual([
        expect.objectContaining({ code: "FGMISS_FROM_FGA_FGM", value: 1, impact: -1 }),
      ]);
    });

    it("falls back to summing present fgmiss_* buckets when fga/fgm are absent", () => {
      const stats = { fgmiss_30_39: 1, fgmiss_50p: 1 }; // fgmiss_40_49 absent
      const scoringSettings = { fgmiss: -1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(-2, 6);
      expect(result.reasons).toEqual([
        expect.objectContaining({ code: "FGMISS_FROM_BUCKETS", value: 2, impact: -2 }),
      ]);
    });

    it("contributes 0 with a reason when no fgmiss data is available at all", () => {
      const stats = { rec: 1 };
      const scoringSettings = { fgmiss: -1, rec: 1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(1, 6);
      expect(result.reasons).toEqual([
        expect.objectContaining({ code: "FGMISS_UNAVAILABLE", value: "fgmiss", impact: 0 }),
      ]);
    });

    it("does not fire when fgmiss is already present (real stats row, no double count)", () => {
      const stats = { fgmiss: 2, fga: 5, fgm: 2 };
      const scoringSettings = { fgmiss: -1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(-2, 6); // plain formula only
      expect(result.reasons).toEqual([]);
    });
  });

  describe("DEF points-allowed bucket exception", () => {
    it("maps a raw pts_allow mean to one bucket when no bucket key is present", () => {
      const stats = { pts_allow: 20.5 };
      const scoringSettings = { pts_allow_14_20: 2, pts_allow_21_27: 1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(2, 6);
      expect(result.reasons).toEqual([
        expect.objectContaining({
          code: "DEF_BUCKET_FROM_MEAN",
          value: "pts_allow_14_20",
          impact: 2,
        }),
      ]);
    });

    it("does nothing special when a bucket key is already present (plain formula scores it)", () => {
      const stats = { pts_allow_14_20: 1, pts_allow: 20.5 };
      const scoringSettings = { pts_allow_14_20: 2, pts_allow_21_27: 1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(2, 6); // from the plain formula alone
      expect(result.reasons).toEqual([]);
    });

    it("does nothing when neither a bucket key nor a raw mean is present", () => {
      const stats = { rec: 1 };
      const scoringSettings = { pts_allow_14_20: 2, rec: 1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(1, 6);
      expect(result.reasons).toEqual([]);
    });

    it("skips the reason when the computed bucket isn't scored by this league", () => {
      const stats = { pts_allow: 40 }; // -> pts_allow_35p, which this league doesn't score
      const scoringSettings = { pts_allow_14_20: 2 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBe(0);
      expect(result.reasons).toEqual([]);
    });
  });

  describe("PROJECTION_KEY_UNAVAILABLE reasons", () => {
    it("attaches one reason per unavailable key the league scores and not present in stats", () => {
      const stats = { rec: 1 };
      const scoringSettings = {
        rec: 1,
        def_st_td: 6,
        def_st_ff: 2,
        def_st_fum_rec: 2,
        st_ff: 2,
        st_fum_rec: 2,
        fum_rec_td: 6,
      };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(1, 6);
      const codes = result.reasons.map((r) => r.code);
      expect(codes).toEqual(Array(6).fill("PROJECTION_KEY_UNAVAILABLE"));
      const flaggedKeys = result.reasons.map((r) => r.value);
      expect(flaggedKeys.sort()).toEqual(
        ["def_st_td", "def_st_ff", "def_st_fum_rec", "st_ff", "st_fum_rec", "fum_rec_td"].sort(),
      );
    });

    it("does not flag an unavailable key the league doesn't score", () => {
      const stats = { rec: 1 };
      const scoringSettings = { rec: 1 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.reasons).toEqual([]);
    });

    it("does not flag an unavailable key that is (unusually) present in the stats row", () => {
      const stats = { st_td: 1, def_st_td: 1 };
      const scoringSettings = { st_td: 6, def_st_td: 6 };
      const result = rescoreProjection({ stats, scoringSettings });
      expect(result.points).toBeCloseTo(12, 6);
      expect(result.reasons).toEqual([]);
    });
  });

  it("does not mutate its inputs", () => {
    const stats = { fgm_50p: 1, pts_allow: 20 };
    const scoringSettings = { fgm_50_59: 5, pts_allow_14_20: 2 };
    rescoreProjection({ stats, scoringSettings });
    expect(stats).toEqual({ fgm_50p: 1, pts_allow: 20 });
    expect(scoringSettings).toEqual({ fgm_50_59: 5, pts_allow_14_20: 2 });
  });
});
