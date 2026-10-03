import { describe, expect, it } from "vitest";
import {
  computePrefilterScore,
  PREFILTER_POOL_SIZE,
  PREFILTER_RECENT_WEIGHT,
  PREFILTER_ROS_WEIGHT,
  prefilterCandidates,
  type PrefilterCandidate,
} from "./prefilter.js";

describe("computePrefilterScore", () => {
  it("weights ROS value and recent points per the documented formula", () => {
    // Hand-computed: 0.7 * 100 + 0.3 * 10 = 73
    const score = computePrefilterScore({ playerId: "x", rosValue: 100, recentAvgPoints: 10 });
    expect(score).toBeCloseTo(PREFILTER_ROS_WEIGHT * 100 + PREFILTER_RECENT_WEIGHT * 10, 9);
    expect(score).toBeCloseTo(73, 9);
  });
});

describe("prefilterCandidates (WAIVER-2 prefilter)", () => {
  it("trims a pool of 200+ down to the default 75 and keeps the highest-scoring ones", () => {
    const pool: PrefilterCandidate[] = [];
    for (let i = 0; i < 220; i++) {
      pool.push({ playerId: `p${i}`, rosValue: i, recentAvgPoints: i / 2 });
    }
    const result = prefilterCandidates(pool);
    expect(result.candidates).toHaveLength(PREFILTER_POOL_SIZE);
    // Scores are monotonically increasing with i, so the top 75 are the 75 highest-index players.
    const expectedIds = new Set(
      Array.from({ length: PREFILTER_POOL_SIZE }, (_, k) => `p${219 - k}`),
    );
    for (const candidate of result.candidates) {
      expect(expectedIds.has(candidate.playerId)).toBe(true);
    }
    expect(result.reasons.find((r) => r.code === "PREFILTER_TRIMMED")?.value).toBe(
      220 - PREFILTER_POOL_SIZE,
    );
  });

  it("does not trim or report a reason when the pool is already at or under the limit", () => {
    const pool: PrefilterCandidate[] = [
      { playerId: "a", rosValue: 5, recentAvgPoints: 1 },
      { playerId: "b", rosValue: 10, recentAvgPoints: 2 },
    ];
    const result = prefilterCandidates(pool, 10);
    expect(result.candidates).toHaveLength(2);
    expect(result.reasons).toHaveLength(0);
  });

  it("breaks exact score ties deterministically by ascending playerId", () => {
    const pool: PrefilterCandidate[] = [
      { playerId: "zzz", rosValue: 10, recentAvgPoints: 0 },
      { playerId: "aaa", rosValue: 10, recentAvgPoints: 0 },
    ];
    const result = prefilterCandidates(pool, 1);
    expect(result.candidates.map((c) => c.playerId)).toEqual(["aaa"]);
  });

  it("respects a custom limit", () => {
    const pool: PrefilterCandidate[] = [
      { playerId: "a", rosValue: 1, recentAvgPoints: 0 },
      { playerId: "b", rosValue: 2, recentAvgPoints: 0 },
      { playerId: "c", rosValue: 3, recentAvgPoints: 0 },
    ];
    const result = prefilterCandidates(pool, 2);
    expect(result.candidates.map((c) => c.playerId)).toEqual(["c", "b"]);
  });
});
