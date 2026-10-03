/**
 * MATCH-1 (PLAN 5.3): defense vs position (DvP). For each NFL defense and position, league-scored
 * points allowed per game this season, with the last 4 weeks weighted 2x, shrunk toward the
 * league position average with `k = 4` games.
 *
 *   rawAvg = (sum of weight * pointsAllowed) / (sum of weight)
 *   w = n / (n + k)
 *   ptsAllowedPg = w * rawAvg + (1 - w) * leaguePositionAverage
 *
 * The "last 4 weeks" are the 4 most recent weeks by week number, regardless of how many games
 * the team has played: when `n <= 4` every available week falls within "the last 4" and is
 * weighted 2x.
 */
import type { Reason } from "@sideline/shared";

/** Shrinkage constant k for {@link computeDefenseVsPosition} (PLAN 5.3, MATCH-1). */
export const DEFAULT_DVP_SHRINKAGE_K = 4;

/** Number of most-recent weeks weighted 2x in the DvP raw average (PLAN 5.3, MATCH-1). */
export const DVP_RECENT_WEEKS_WEIGHTED = 4;

/** Weight applied to the most recent `DVP_RECENT_WEEKS_WEIGHTED` weeks. */
export const DVP_RECENT_WEEK_WEIGHT = 2;

/** Weight applied to every earlier week. */
export const DVP_EARLIER_WEEK_WEIGHT = 1;

export interface WeeklyPointsAllowed {
  week: number;
  pointsAllowed: number;
}

export interface DefenseVsPositionInput {
  /** One entry per game this team has played so far this season at this position, any order. */
  weeklyPointsAllowed: readonly WeeklyPointsAllowed[];
  /** League-wide average points allowed per game at this position (the shrinkage target). */
  leaguePositionAverage: number;
  /** Shrinkage constant. Defaults to 4 per PLAN 5.2's pattern applied to MATCH-1 ("k = 4 games"). */
  k?: number;
}

export interface DefenseVsPositionResult {
  ptsAllowedPg: number;
  games: number;
  reasons: Reason[];
}

export function computeDefenseVsPosition(input: DefenseVsPositionInput): DefenseVsPositionResult {
  const { weeklyPointsAllowed, leaguePositionAverage, k = DEFAULT_DVP_SHRINKAGE_K } = input;
  const n = weeklyPointsAllowed.length;

  const sorted = [...weeklyPointsAllowed].sort((a, b) => a.week - b.week);
  const recentCount = Math.min(DVP_RECENT_WEEKS_WEIGHTED, n);
  const recentWeekSet = new Set(sorted.slice(n - recentCount).map((entry) => entry.week));

  let weightedSum = 0;
  let weightSum = 0;
  for (const entry of sorted) {
    const weight = recentWeekSet.has(entry.week) ? DVP_RECENT_WEEK_WEIGHT : DVP_EARLIER_WEEK_WEIGHT;
    weightedSum += weight * entry.pointsAllowed;
    weightSum += weight;
  }
  const rawAvg = weightSum === 0 ? 0 : weightedSum / weightSum;

  const w = n / (n + k);
  const ptsAllowedPg = w * rawAvg + (1 - w) * leaguePositionAverage;

  const reasons: Reason[] = [];
  if (n < k) {
    reasons.push({
      code: "DVP_SHRUNK_LIMITED_HISTORY",
      label: "Limited game history, blended toward the league average",
      value: n,
    });
  }

  return { ptsAllowedPg, games: n, reasons };
}
