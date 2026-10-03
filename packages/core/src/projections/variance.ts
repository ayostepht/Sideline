/**
 * PROJ-2 (PLAN 5.2): weekly standard deviation per player, estimated from league-scored
 * weekly results (this season plus the 2025 season rescored with the league's scoring,
 * ADR-002 item 4) and shrunk toward the position-level coefficient of variation:
 *
 *   sd = w * sdPlayer + (1 - w) * positionCv * proj
 *   w = n / (n + k)
 *
 * `n` is the number of weekly points samples the caller supplies; `k` defaults to 6 per
 * PLAN 5.2 ("start with k = 6; tune in backtest") and is exported as a named constant so it
 * stays easy to find and tune. `sdPlayer` is the *population* standard deviation (divides by
 * `n`, not `n - 1`) of the supplied weekly points.
 */
import type { Reason } from "@sideline/shared";

/** Default shrinkage constant k for {@link weeklyStandardDeviation} (PLAN 5.2, PROJ-2). */
export const DEFAULT_VARIANCE_SHRINKAGE_K = 6;

export interface WeeklyStandardDeviationInput {
  /** This player's historical league-scored weekly point totals (this season plus 2025, per ADR-002 item 4). Order does not matter. */
  weeklyPoints: readonly number[];
  /** Position-level coefficient of variation (sd / mean at the position), supplied by the caller. */
  positionCv: number;
  /** This week's base projection (the mean used for the shrinkage prior term). */
  proj: number;
  /** Shrinkage constant. Defaults to 6 per PLAN 5.2 ("start with k = 6; tune in backtest"). */
  k?: number;
}

export interface WeeklyStandardDeviationResult {
  sd: number;
  reasons: Reason[];
}

function populationStandardDeviation(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) {
    return 0;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const sumSquaredDeviations = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sumSquaredDeviations / n);
}

export function weeklyStandardDeviation(
  input: WeeklyStandardDeviationInput,
): WeeklyStandardDeviationResult {
  const { weeklyPoints, positionCv, proj, k = DEFAULT_VARIANCE_SHRINKAGE_K } = input;
  const n = weeklyPoints.length;
  const sdPlayer = populationStandardDeviation(weeklyPoints);
  const w = n / (n + k);
  const sd = Math.max(0, w * sdPlayer + (1 - w) * positionCv * proj);

  const reasons: Reason[] = [];
  if (n < k) {
    reasons.push({
      code: "VARIANCE_SHRUNK_LIMITED_HISTORY",
      label: "Limited weekly history, blended toward the position average",
      value: n,
    });
  }

  return { sd, reasons };
}
