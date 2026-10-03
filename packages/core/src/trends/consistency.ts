/**
 * TREND-3 (PLAN 5.5): consistency (coefficient of variation) and league-aware boom/bust weeks.
 *
 * CV = population standard deviation of the player's own weekly points / mean of those points.
 * This mirrors the population-SD approach documented in `packages/core/src/projections/
 * variance.ts` (PROJ-2), but is a simpler same-player statistic, not a cross-player shrinkage
 * prior, so the formula is reimplemented locally rather than imported: `variance.ts` lives in
 * `projections/` (a different module with a different purpose and its own test suite) and does
 * not export a reusable population-SD helper today. Duplicating a four-line pure function here
 * keeps this module independently testable without creating a cross-directory dependency for a
 * formula this simple.
 *
 * Boom/bust are league-aware (TREND-3): the caller supplies `startableCount` (`N`, the number of
 * startable players at this player's position league-wide, e.g. from
 * `resolveSlots`/roster settings) and, for each week, this player's finish rank among all
 * startable-position players league-wide that week (1 = best). A boom week is a top-`N` finish
 * (`rank <= N`); a bust week is a finish worse than rank `1.5 * N` (`rank > 1.5 * N`). A rank
 * exactly at `1.5 * N` is neither (not "worse than").
 */
import type { Reason } from "@sideline/shared";

/** Boom threshold multiplier: top-`N` finish (PLAN 5.5, TREND-3). */
export const BOOM_RANK_MULTIPLIER = 1;
/** Bust threshold multiplier: worse than rank `1.5 * N` (PLAN 5.5, TREND-3). */
export const BUST_RANK_MULTIPLIER = 1.5;

export interface ConsistencyWeek {
  week: number;
  actualPts: number;
  /** This player's rank (1 = best) among all startable-position players league-wide this week,
   * by league-scored points. The caller computes this since it requires cross-player,
   * league-wide data this function does not have. */
  positionRank: number;
}

export interface ConsistencyInput {
  /** Weeks the player actually played, any order. */
  weeks: readonly ConsistencyWeek[];
  /** `N`: the number of startable players at this player's position, league-wide. */
  startableCount: number;
}

export interface ConsistencyWeekResult extends ConsistencyWeek {
  isBoom: boolean;
  isBust: boolean;
}

export interface ConsistencyResult {
  /** Coefficient of variation (sd / mean) of the player's weekly points. 0 when points data is
   * insufficient or the mean is 0 (see reasons for which). */
  cv: number;
  weeks: ConsistencyWeekResult[];
  boomCount: number;
  bustCount: number;
  reasons: Reason[];
}

// Only ever called with a non-empty array: `computeConsistency` returns early for 0 weeks below,
// so there is no `n === 0` guard here (it would be dead code, unreachable through the public API).
function populationStandardDeviation(values: readonly number[]): number {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const sumSquaredDeviations = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sumSquaredDeviations / n);
}

export function computeConsistency(input: ConsistencyInput): ConsistencyResult {
  const { weeks, startableCount } = input;
  const n = weeks.length;

  if (n === 0) {
    return {
      cv: 0,
      weeks: [],
      boomCount: 0,
      bustCount: 0,
      reasons: [
        {
          code: "TREND_CV_NO_GAMES_PLAYED",
          label: "No games played yet this season",
          value: 0,
        },
      ],
    };
  }

  const reasons: Reason[] = [];
  const points = weeks.map((w) => w.actualPts);
  const mean = points.reduce((sum, v) => sum + v, 0) / n;

  let cv: number;
  if (mean === 0) {
    cv = 0;
    reasons.push({
      code: "TREND_CV_ZERO_MEAN",
      label: "Average points is zero; consistency score is not meaningful",
      value: 0,
    });
  } else {
    cv = populationStandardDeviation(points) / mean;
  }

  if (n < 2) {
    reasons.push({
      code: "TREND_CV_SMALL_SAMPLE",
      label: "Fewer than 2 games played; consistency estimate is unreliable",
      value: n,
    });
  }

  if (startableCount <= 0) {
    reasons.push({
      code: "TREND_INVALID_STARTABLE_COUNT",
      label: "League-wide startable count is zero or negative; boom/bust flags are unavailable",
      value: startableCount,
    });
    const weeksResult = weeks.map((w) => ({ ...w, isBoom: false, isBust: false }));
    return { cv, weeks: weeksResult, boomCount: 0, bustCount: 0, reasons };
  }

  const bustThreshold = BUST_RANK_MULTIPLIER * startableCount;
  const boomThreshold = BOOM_RANK_MULTIPLIER * startableCount;
  const weeksResult: ConsistencyWeekResult[] = weeks.map((w) => ({
    ...w,
    isBoom: w.positionRank <= boomThreshold,
    isBust: w.positionRank > bustThreshold,
  }));
  const boomCount = weeksResult.filter((w) => w.isBoom).length;
  const bustCount = weeksResult.filter((w) => w.isBust).length;

  return { cv, weeks: weeksResult, boomCount, bustCount, reasons };
}
