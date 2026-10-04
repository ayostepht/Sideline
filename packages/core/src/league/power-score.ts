/**
 * LEAGUE-3 (PLAN 5.8): power score, a single "how good is this team really" number combining
 * schedule-neutral performance, recent form, and roster strength.
 *
 *   powerScore = 0.4 * allPlayWinRate
 *              + 0.3 * recentPointsForNormalized
 *              + 0.3 * rosterStrengthNormalized
 *
 * Weights are exported as `POWER_SCORE_WEIGHTS` so the UI tooltip (PLAN requires the weights be
 * shown there) and this module always agree, and so a future tuning pass changes one constant
 * rather than hunting for magic numbers.
 *
 * Inputs are already-normalized [0, 1] numbers (plain, caller-supplied -- this module never
 * imports `optimizer/` or `projections/` to compute roster strength itself, per the package's
 * decoupling convention):
 *
 * - `allPlayWinRate`: the season (or to-date) all-play win rate from `all-play.ts` (LEAGUE-1).
 *   It is already naturally in [0, 1] (it is a rate) and is NOT run through `minMaxNormalize`:
 *   doing so would stretch a tight real-world spread of win rates (e.g. 0.45 to 0.55 across a
 *   competitive league) out to the full [0, 1] range, making a genuinely mediocre team's win rate
 *   look artificially good or bad relative to the league.
 * - `recentPointsForNormalized`: last-3-week points for, run through `minMaxNormalize` across the
 *   league's teams by the caller before being passed in.
 * - `rosterStrengthNormalized`: each team's ROS optimal-lineup projection total, likewise run
 *   through `minMaxNormalize` across the league's teams by the caller.
 *
 * `minMaxNormalize` is exported here as the normalization helper requirement 3 asks for: min and
 * max of the supplied list map to 0 and 1; everything else is linearly interpolated, so a value
 * equal to the list's median maps to 0.5 whenever the list is symmetric around that median (no
 * special-casing needed -- that is a property of min-max scaling). Degenerate case: when every
 * value in the list is identical (no spread to normalize against, e.g. a single-team list, or a
 * week where every team scored the same), every value maps to 0.5 (a neutral score) rather than
 * dividing by zero.
 */
import type { Reason } from "@sideline/shared";

/** LEAGUE-3 weights. Shown in a UI tooltip; sum to 1. */
export const POWER_SCORE_WEIGHTS = {
  allPlay: 0.4,
  recentPointsFor: 0.3,
  rosterStrength: 0.3,
} as const;

export interface PowerScoreComponents {
  /** Season (or to-date) all-play win rate, already in [0, 1]. Not normalized (see module doc). */
  allPlayWinRate: number;
  /** Last-3-week points for, already min-max normalized across the league's teams to [0, 1]. */
  recentPointsForNormalized: number;
  /** ROS optimal lineup projection total, already min-max normalized across the league's teams to [0, 1]. */
  rosterStrengthNormalized: number;
}

/** The LEAGUE-3 weighted sum. Pure number, no reasons -- use `computePowerScore` for the
 * reasons-carrying breakdown. */
export function powerScore(components: PowerScoreComponents): number {
  const { allPlayWinRate, recentPointsForNormalized, rosterStrengthNormalized } = components;
  return (
    POWER_SCORE_WEIGHTS.allPlay * allPlayWinRate +
    POWER_SCORE_WEIGHTS.recentPointsFor * recentPointsForNormalized +
    POWER_SCORE_WEIGHTS.rosterStrength * rosterStrengthNormalized
  );
}

export interface PowerScoreResult {
  powerScore: number;
  reasons: Reason[];
}

/** Same formula as `powerScore`, with a per-component contribution breakdown for UI display. */
export function computePowerScore(components: PowerScoreComponents): PowerScoreResult {
  const { allPlayWinRate, recentPointsForNormalized, rosterStrengthNormalized } = components;

  const reasons: Reason[] = [
    {
      code: "LEAGUE_POWER_SCORE_ALL_PLAY",
      label: "All-play win rate contribution",
      value: POWER_SCORE_WEIGHTS.allPlay * allPlayWinRate,
    },
    {
      code: "LEAGUE_POWER_SCORE_RECENT_POINTS",
      label: "Recent points for contribution (last 3 weeks, normalized)",
      value: POWER_SCORE_WEIGHTS.recentPointsFor * recentPointsForNormalized,
    },
    {
      code: "LEAGUE_POWER_SCORE_ROSTER_STRENGTH",
      label: "Roster strength contribution (rest-of-season optimal lineup, normalized)",
      value: POWER_SCORE_WEIGHTS.rosterStrength * rosterStrengthNormalized,
    },
  ];

  return { powerScore: powerScore(components), reasons };
}

/**
 * Min-max normalize a list of raw values to [0, 1]: the list's min maps to 0, its max maps to 1,
 * everything else is linearly interpolated. A degenerate list (every value identical, including a
 * single-element list) maps every value to 0.5 rather than dividing by zero: with no spread in
 * the data, there is nothing to distinguish teams on, so a neutral score is the most honest
 * answer. An empty list returns an empty list.
 */
export function minMaxNormalize(values: readonly number[]): number[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    return values.map(() => 0.5);
  }
  return values.map((v) => (v - min) / (max - min));
}
