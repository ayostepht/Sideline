/**
 * WAIVER-3 (PLAN 5.6): the Waiver Score, a single 0-100 composite summarizing how good a waiver
 * candidate is, built from five already-percentile-normalized (0-100) inputs:
 *
 * `score = sum(weight_i * percentile_i)` for `i` in
 * {lineupImpact, rosValue, usageTrend, momentum, schedule}, with default weights 40/20/20/10/10
 * (summing to 1.0, PLAN 5.6 WAIVER-3). Because every input is a percentile in [0, 100] and the
 * weights sum to 1, `score` always lands in [0, 100] too.
 *
 * ## Decoupling (ADR-015 item 2)
 * This function takes plain, already-normalized percentile numbers as its only numeric inputs. It
 * does not import `../trends/` (TREND-4's Rising/Steady/Falling signal lives there), does not
 * import `lineup-impact.ts` or `prefilter.ts`, and does not itself compute a percentile across a
 * candidate pool (that requires league-wide data across every candidate, which is T4.5's job,
 * backend-engineer, downstream of this module). Keeping the signature this narrow is what makes the
 * composite trivially unit-testable with synthetic numbers and lets T4.1 (trends) and T4.2a
 * (lineup impact) land fully in parallel with zero risk of one agent's in-progress shape breaking
 * the other.
 *
 * ## Weight validation (documented choice)
 * Custom weights are accepted but must sum to 1.0 within {@link WAIVER_SCORE_WEIGHT_SUM_EPSILON}.
 * This module does **not** silently renormalize a bad weight set: a caller-supplied `weights` object
 * whose components do not sum to 1.0 is a programming error (a typo, a missing component, a stale
 * config), and silently rescaling it would hide that bug behind a plausible-looking 0-100 number.
 * {@link computeWaiverScore} throws a descriptive `Error` instead, so the mistake surfaces at the
 * call site during development rather than shipping a quietly-wrong score.
 *
 * ## Out-of-range percentiles (documented choice)
 * A percentile input outside [0, 100] (a caller bug upstream, e.g. an unbounded z-score mistakenly
 * passed in instead of a percentile) is clamped to the nearest bound rather than rejected, so one bad
 * upstream signal degrades gracefully to "extreme" instead of crashing the whole waiver view. Each
 * clamped input gets its own extra `Reason` (`WAIVER_SCORE_PERCENTILE_CLAMPED`) citing the original,
 * out-of-range value, in addition to its normal weighted-component chip (which reports the clamped
 * value actually used).
 */
import type { Reason } from "@sideline/shared";

/** Default Waiver Score weights (WAIVER-3): Lineup Impact 40%, ROS value 20%, usage trend 20%,
 * Sleeper momentum 10%, schedule (next 3 weeks) 10%. Sums to 1.0. */
export const DEFAULT_WAIVER_SCORE_WEIGHTS: WaiverScoreWeights = {
  lineupImpact: 0.4,
  rosValue: 0.2,
  usageTrend: 0.2,
  momentum: 0.1,
  schedule: 0.1,
};

/** Tolerance for validating that a weight set sums to 1.0, to absorb floating-point noise in
 * caller-supplied literals (e.g. `0.4 + 0.2 + 0.2 + 0.1 + 0.1` is `0.9999999999999999` in IEEE 754). */
export const WAIVER_SCORE_WEIGHT_SUM_EPSILON = 1e-6;

/** Valid range for every percentile input. Values outside this range are clamped (see module doc). */
export const WAIVER_SCORE_PERCENTILE_MIN = 0;
export const WAIVER_SCORE_PERCENTILE_MAX = 100;

export interface WaiverScoreWeights {
  /** Weight on the Lineup Impact percentile (default 0.4). */
  lineupImpact: number;
  /** Weight on the rest-of-season value percentile (default 0.2). */
  rosValue: number;
  /** Weight on the usage trend percentile (default 0.2). */
  usageTrend: number;
  /** Weight on the Sleeper momentum percentile (default 0.1). */
  momentum: number;
  /** Weight on the next-3-weeks schedule percentile (default 0.1). */
  schedule: number;
}

export interface WaiverScoreInput {
  /** Percentile (0-100) rank of this candidate's Lineup Impact (WAIVER-2) among its peer set. */
  lineupImpactPercentile: number;
  /** Percentile (0-100) rank of this candidate's rest-of-season value (PROJ-4) among its peer set. */
  rosValuePercentile: number;
  /** Percentile (0-100) rank of this candidate's usage trend (TREND-3/4) among its peer set. */
  usageTrendPercentile: number;
  /** Percentile (0-100) rank of this candidate's Sleeper add/drop momentum (TREND-5) among its peer set. */
  momentumPercentile: number;
  /** Percentile (0-100) rank of this candidate's next-3-weeks schedule (matchup grades) among its peer set. */
  schedulePercentile: number;
  /** Overrides {@link DEFAULT_WAIVER_SCORE_WEIGHTS}. Must sum to 1.0 within
   * {@link WAIVER_SCORE_WEIGHT_SUM_EPSILON}, or {@link computeWaiverScore} throws. */
  weights?: WaiverScoreWeights;
}

export interface WaiverScoreResult {
  /** The composite 0-100 Waiver Score (WAIVER-3). */
  score: number;
  /** One chip per weighted component (plus any clamp warnings), in WAIVER-3's documented order. */
  reasons: Reason[];
}

interface WeightedComponent {
  code: string;
  label: string;
  percentile: number;
  weight: number;
}

function sumWeights(weights: WaiverScoreWeights): number {
  return (
    weights.lineupImpact +
    weights.rosValue +
    weights.usageTrend +
    weights.momentum +
    weights.schedule
  );
}

/** Clamps `value` to [{@link WAIVER_SCORE_PERCENTILE_MIN}, {@link WAIVER_SCORE_PERCENTILE_MAX}]. */
function clampPercentile(value: number): number {
  if (value < WAIVER_SCORE_PERCENTILE_MIN) return WAIVER_SCORE_PERCENTILE_MIN;
  if (value > WAIVER_SCORE_PERCENTILE_MAX) return WAIVER_SCORE_PERCENTILE_MAX;
  return value;
}

/**
 * WAIVER-3: computes the composite Waiver Score from five pre-normalized percentile inputs. See
 * the module doc for the formula, the weight-validation behavior, and out-of-range handling.
 *
 * @throws {Error} if `input.weights` is given and its components do not sum to 1.0 within
 * {@link WAIVER_SCORE_WEIGHT_SUM_EPSILON}. The default weights always pass this check.
 */
export function computeWaiverScore(input: WaiverScoreInput): WaiverScoreResult {
  const weights = input.weights ?? DEFAULT_WAIVER_SCORE_WEIGHTS;
  const weightSum = sumWeights(weights);
  if (Math.abs(weightSum - 1) > WAIVER_SCORE_WEIGHT_SUM_EPSILON) {
    throw new Error(
      `Waiver Score weights must sum to 1.0 (within ${WAIVER_SCORE_WEIGHT_SUM_EPSILON}); got ${weightSum} ` +
        `(lineupImpact=${weights.lineupImpact}, rosValue=${weights.rosValue}, ` +
        `usageTrend=${weights.usageTrend}, momentum=${weights.momentum}, schedule=${weights.schedule})`,
    );
  }

  const components: WeightedComponent[] = [
    {
      code: "WAIVER_SCORE_LINEUP_IMPACT",
      label: "Lineup Impact",
      percentile: input.lineupImpactPercentile,
      weight: weights.lineupImpact,
    },
    {
      code: "WAIVER_SCORE_ROS_VALUE",
      label: "Rest-of-season value",
      percentile: input.rosValuePercentile,
      weight: weights.rosValue,
    },
    {
      code: "WAIVER_SCORE_USAGE_TREND",
      label: "Usage trend",
      percentile: input.usageTrendPercentile,
      weight: weights.usageTrend,
    },
    {
      code: "WAIVER_SCORE_MOMENTUM",
      label: "Sleeper momentum",
      percentile: input.momentumPercentile,
      weight: weights.momentum,
    },
    {
      code: "WAIVER_SCORE_SCHEDULE",
      label: "Schedule (next 3 weeks)",
      percentile: input.schedulePercentile,
      weight: weights.schedule,
    },
  ];

  const reasons: Reason[] = [];
  let score = 0;

  for (const component of components) {
    const clamped = clampPercentile(component.percentile);
    if (clamped !== component.percentile) {
      reasons.push({
        code: "WAIVER_SCORE_PERCENTILE_CLAMPED",
        label: `${component.label} score was out of range, so we capped it`,
        value: component.percentile,
      });
    }
    const contribution = component.weight * clamped;
    score += contribution;
    reasons.push({
      code: component.code,
      label: component.label,
      value: clamped,
      impact: contribution,
    });
  }

  return { score, reasons };
}
