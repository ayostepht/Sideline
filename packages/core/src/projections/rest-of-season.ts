/**
 * PROJ-4 (PLAN 5.2): rest-of-season (ROS) projection. Sums available weekly projections
 * (already rescored via SCORE-3, e.g. {@link baseProjection}) for the remaining regular-season
 * weeks; when a week has no projection, falls back to the player's season points-per-game
 * average for that week and labels the result as an estimate; when neither is available for a
 * week, that week contributes 0 and is labeled as having no data.
 *
 * A per-week `multiplier` (e.g. a future matchup-strength adjustment, MATCH-2) is accepted as a
 * plain input and defaults to 1 when omitted; this module never imports a matchup module so it
 * stays independently testable.
 */
import type { Reason } from "@sideline/shared";

export interface RestOfSeasonWeek {
  week: number;
  /** Already-rescored base projection for this week (SCORE-3), or null when none exists. */
  projectedPoints: number | null;
  /** Multiplier applied to this week's contribution. Defaults to 1 when omitted. */
  multiplier?: number;
}

export interface RestOfSeasonProjectionInput {
  weeks: readonly RestOfSeasonWeek[];
  /** Season points-per-game average used as a fallback for weeks with no projection. */
  seasonPpg: number | null;
}

export interface RestOfSeasonProjectionResult {
  points: number;
  reasons: Reason[];
}

export function restOfSeasonProjection(
  input: RestOfSeasonProjectionInput,
): RestOfSeasonProjectionResult {
  const { weeks, seasonPpg } = input;

  let points = 0;
  let estimatedFromPpgCount = 0;
  let noDataCount = 0;

  for (const week of weeks) {
    const multiplier = week.multiplier ?? 1;
    if (week.projectedPoints !== null) {
      points += week.projectedPoints * multiplier;
    } else if (seasonPpg !== null) {
      points += seasonPpg * multiplier;
      estimatedFromPpgCount += 1;
    } else {
      noDataCount += 1;
    }
  }

  const reasons: Reason[] = [];
  if (estimatedFromPpgCount > 0) {
    reasons.push({
      code: "ROS_ESTIMATED_FROM_PPG",
      label: "Used season average for weeks without a projection",
      value: estimatedFromPpgCount,
    });
  }
  if (noDataCount > 0) {
    reasons.push({
      code: "ROS_WEEK_NO_DATA",
      label: "No data to estimate some remaining weeks",
      value: noDataCount,
    });
  }

  return { points, reasons };
}
