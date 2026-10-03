/**
 * WAIVER-2 (PLAN 5.6): the cheap prefilter composite that narrows a candidate pool (potentially
 * hundreds of players, WAIVER-1) down to {@link PREFILTER_POOL_SIZE} before the expensive Lineup
 * Impact calculation (`lineup-impact.ts`) runs on each survivor.
 *
 * ## Formula
 * `score = PREFILTER_ROS_WEIGHT * rosValue + PREFILTER_RECENT_WEIGHT * recentAvgPoints`
 *
 * Both inputs are plain numbers the caller already has on hand (e.g. `restOfSeasonProjection(...)
 * .points` and a recent-games average like L3 PPG already computed by a trends module) - this
 * function does not call the optimizer, `restOfSeasonProjection`, or any other analytics function;
 * it is a pure arithmetic ranking over caller-supplied scores, intentionally cheap enough to run
 * over the full, unfiltered candidate pool.
 *
 * ROS value is weighted more heavily (0.7) because it already looks across every remaining week
 * and is the better predictor of a candidate actually being worth a Lineup Impact calculation;
 * recent average points (0.3) corrects for players whose role just changed (an injury opening up
 * touches, a new starting job) faster than a season-spanning ROS projection typically does. Both
 * weights are named, exported constants, not magic numbers, and sum to 1 so `score` stays in the
 * same units as the two inputs (fantasy points).
 */
import type { Reason } from "@sideline/shared";

/** How many candidates survive the prefilter before Lineup Impact runs (WAIVER-2). */
export const PREFILTER_POOL_SIZE = 75;

/** Weight on rest-of-season value in the prefilter composite score. */
export const PREFILTER_ROS_WEIGHT = 0.7;

/** Weight on recent average points (e.g. L3 PPG) in the prefilter composite score. */
export const PREFILTER_RECENT_WEIGHT = 0.3;

export interface PrefilterCandidate {
  playerId: string;
  /** Rest-of-season projected value, e.g. `restOfSeasonProjection(...).points`. */
  rosValue: number;
  /** A recent-usage/points signal the caller already has, e.g. last-3-games average points. */
  recentAvgPoints: number;
}

export interface PrefilterResult<T extends PrefilterCandidate> {
  candidates: readonly T[];
  reasons: Reason[];
}

/** The prefilter composite score (higher is better). Exported so callers can display or sort by it. */
export function computePrefilterScore(candidate: PrefilterCandidate): number {
  return (
    PREFILTER_ROS_WEIGHT * candidate.rosValue + PREFILTER_RECENT_WEIGHT * candidate.recentAvgPoints
  );
}

/**
 * WAIVER-2 prefilter: sorts `candidates` by {@link computePrefilterScore} descending (ties broken
 * by ascending `playerId` for determinism) and keeps the top `limit` (default
 * {@link PREFILTER_POOL_SIZE}). Generic over `T` so callers can carry whatever extra fields they
 * need through the trim without this module knowing about them.
 */
export function prefilterCandidates<T extends PrefilterCandidate>(
  candidates: readonly T[],
  limit: number = PREFILTER_POOL_SIZE,
): PrefilterResult<T> {
  const sorted = candidates.slice().sort((a, b) => {
    const scoreDiff = computePrefilterScore(b) - computePrefilterScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const trimmed = sorted.slice(0, Math.max(0, limit));

  const reasons: Reason[] = [];
  if (candidates.length > trimmed.length) {
    reasons.push({
      code: "PREFILTER_TRIMMED",
      label: `Narrowed ${candidates.length} candidates to the top ${trimmed.length} by rest-of-season value and recent usage before computing Lineup Impact`,
      value: candidates.length - trimmed.length,
    });
  }

  return { candidates: trimmed, reasons };
}
