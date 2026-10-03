/**
 * PROJ-3 (PLAN 5.2): floor and ceiling are the 20th and 80th percentiles. When at least 10
 * historical weekly points are available, computed empirically (linear interpolation between
 * closest ranks); otherwise a normal approximation truncated at 0, using {@link weeklyStandardDeviation}
 * (PROJ-2) as the standard deviation.
 */
import type { Reason } from "@sideline/shared";

/** Minimum number of historical weekly points required to use the empirical-quantile path. */
export const FLOOR_CEILING_EMPIRICAL_MIN_SAMPLES = 10;

/** Standard normal distribution's 20th percentile z-score, used by the normal-approximation path. */
export const Z_20 = -0.8416212335729143;
/** Standard normal distribution's 80th percentile z-score, used by the normal-approximation path. */
export const Z_80 = 0.8416212335729143;

export interface FloorCeilingInput {
  /** Mean (the base projection). */
  proj: number;
  /** From weeklyStandardDeviation. */
  sd: number;
  /** This player's historical weekly points, for the empirical-quantile path when there are at least 10. Optional. */
  historicalWeeklyPoints?: readonly number[];
}

export interface FloorCeilingResult {
  floor: number;
  ceiling: number;
  reasons: Reason[];
}

/**
 * Linear interpolation between closest ranks (the standard "percentile" method): for a sorted
 * ascending array and a percentile `p` in [0, 1], `index = p * (n - 1)`, then interpolate between
 * `sorted[floor(index)]` and `sorted[ceil(index)]`.
 */
function empiricalPercentile(sortedAscending: readonly number[], p: number): number {
  const n = sortedAscending.length;
  const index = p * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  // Safety: lower and upper are both derived from `index`, which is clamped to [0, n - 1]
  // for p in [0, 1], so both indices are always in bounds for a non-empty array.
  const lowerValue = sortedAscending[lower] as number;
  const upperValue = sortedAscending[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function floorAndCeiling(input: FloorCeilingInput): FloorCeilingResult {
  const { proj, sd, historicalWeeklyPoints } = input;

  if (
    historicalWeeklyPoints !== undefined &&
    historicalWeeklyPoints.length >= FLOOR_CEILING_EMPIRICAL_MIN_SAMPLES
  ) {
    const sorted = [...historicalWeeklyPoints].sort((a, b) => a - b);
    return {
      floor: empiricalPercentile(sorted, 0.2),
      ceiling: empiricalPercentile(sorted, 0.8),
      reasons: [
        {
          code: "FLOOR_CEILING_EMPIRICAL",
          label: "Based on this player's actual weekly scores",
          value: historicalWeeklyPoints.length,
        },
      ],
    };
  }

  return {
    floor: Math.max(0, proj + Z_20 * sd),
    ceiling: Math.max(0, proj + Z_80 * sd),
    reasons: [
      {
        code: "FLOOR_CEILING_NORMAL_APPROX",
        label: "Estimated range since we don't have enough game history yet",
      },
    ],
  };
}
