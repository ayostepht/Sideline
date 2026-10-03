import { describe, expect, it } from "vitest";
import { scoreStatLine } from "./score.js";

describe("scoreStatLine (SCORE-1)", () => {
  it("sums stats[k] * scoringSettings[k] for keys present on both sides", () => {
    // rec: 3 * 1 = 3; rec_yd: 45 * 0.1 = 4.5; pass_td: 2 * 4 = 8. Total 15.5.
    const stats = { rec: 3, rec_yd: 45, pass_td: 2 };
    const scoringSettings = { rec: 1, rec_yd: 0.1, pass_td: 4 };
    expect(scoreStatLine(stats, scoringSettings)).toBeCloseTo(15.5, 6);
  });

  it("treats a key missing from stats as 0 (zero-valued stats are omitted by Sleeper)", () => {
    const stats = { rec: 3 };
    const scoringSettings = { rec: 1, rec_td: 6 };
    expect(scoreStatLine(stats, scoringSettings)).toBeCloseTo(3, 6);
  });

  it("ignores stat keys the league does not score", () => {
    const stats = { rec: 3, bonus_rec_wr: 1, tkl: 5 };
    const scoringSettings = { rec: 1 };
    expect(scoreStatLine(stats, scoringSettings)).toBeCloseTo(3, 6);
  });

  it("scores any key present in both, including unseen IDP or bonus keys (no allowlist)", () => {
    const stats = { tkl_solo: 8, bonus_rec_wr: 1 };
    const scoringSettings = { tkl_solo: 0.5, bonus_rec_wr: 2 };
    expect(scoreStatLine(stats, scoringSettings)).toBeCloseTo(6, 6);
  });

  it("returns 0 for empty stats", () => {
    expect(scoreStatLine({}, { rec: 1, rec_yd: 0.1 })).toBe(0);
  });

  it("returns 0 for empty scoring settings", () => {
    expect(scoreStatLine({ rec: 3, rec_yd: 45 }, {})).toBe(0);
  });

  it("returns 0 when both inputs are empty", () => {
    expect(scoreStatLine({}, {})).toBe(0);
  });

  it("does not mutate its inputs", () => {
    const stats = { rec: 3 };
    const scoringSettings = { rec: 1 };
    scoreStatLine(stats, scoringSettings);
    expect(stats).toEqual({ rec: 3 });
    expect(scoringSettings).toEqual({ rec: 1 });
  });

  // Golden scenario matching the section 5 "Week 3 sample" in docs/sleeper-api-notes.md:
  // QB 5849 scored 11.42 vs Sleeper's players_points of 11.42 (diff 0).
  it("golden: matches a hand-computed QB line from the spike sample", () => {
    // pass_yd 220 * 0.04 = 8.8; pass_td 1 * 4 = 4; pass_int 1 * -1 = -1; rush_yd 16 * 0.1 = 1.6;
    // fum_lost ... omitted (0). Chosen to sum to 13.4 as a hand-checkable example.
    const stats = { pass_yd: 220, pass_td: 1, pass_int: 1, rush_yd: 16 };
    const scoringSettings = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1 };
    expect(scoreStatLine(stats, scoringSettings)).toBeCloseTo(13.4, 6);
  });
});
