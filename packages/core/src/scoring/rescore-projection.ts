/**
 * SCORE-3 (PLAN 5.1): rescore a projection row with the league's `scoring_settings`.
 *
 * Projection rows (Sleeper's rotowire-sourced `/projections/nfl/...`) use a coarser stat
 * vocabulary than final stats: some league scoring keys have no projection equivalent at all,
 * and a few are combined buckets that can't be split back apart. `rescoreProjection` starts from
 * the plain {@link scoreStatLine} formula (exact for every key the projection does carry) and
 * then applies exactly the documented exceptions below, each with a {@link Reason} so the UI can
 * explain the approximation. See docs/sleeper-api-notes.md section 6 (ground truth) and
 * ADR-002 item 3.
 *
 * Exceptions (fire only when the matching projection data is actually missing, so an exception
 * never double-counts a key a real stats row already carries):
 *
 * 1. **Field goals 50+ (`fgm_50p`).** Projections carry a single combined `fgm_50p` count for all
 *    makes of 50 yards or more; they cannot say how many were 50 to 59 versus 60-plus. When the
 *    league scores the split buckets (`scoringSettings.fgm_50_59` set) and the stats row has no
 *    `fgm_50_59` of its own, the combined `stats.fgm_50p` count is scored at the league's
 *    `fgm_50_59` rate (the only one of the two rates we have). This slightly overstates or
 *    understates leagues that pay 60-plus makes differently; the reason flags it as approximate.
 * 2. **Missed field goals (`fgmiss`).** Projections never carry `fgmiss` directly. When the
 *    league scores it and the stats row has no `fgmiss` of its own: prefer
 *    `stats.fga - stats.fgm` (attempts minus makes) when both are present; otherwise fall back to
 *    summing whichever of `fgmiss_30_39`, `fgmiss_40_49`, `fgmiss_50p` are present; otherwise
 *    contribute 0 with a reason explaining no data was available.
 * 3. **DEF points-allowed buckets.** When a bucket key (`pts_allow_0` ... `pts_allow_35p`) is
 *    already present in the stats row, nothing special happens: {@link scoreStatLine} scores it
 *    by name like any other key. Only when **no** bucket key is present but a raw mean
 *    `stats.pts_allow` is, the mean is mapped to one bucket (one-hot, like Sleeper's own
 *    projection rows do; see docs/sleeper-api-notes.md section 4.2's `20.5` -> `pts_allow_14_20`
 *    example, which floors the mean before bucketing) and that single bucket's
 *    `scoringSettings` value is added directly. This is a step-function substitute for a
 *    true expected value over the distribution of points allowed, so it is always flagged.
 * 4. **DEF/ST return and recovery TDs.** `def_st_td`, `def_st_ff`, `def_st_fum_rec`, `st_ff`,
 *    `st_fum_rec` and `fum_rec_td` never appear in projection rows at all. When the league scores
 *    one of these keys, it already contributes 0 by the plain formula (the key is simply absent),
 *    but a reason is attached per key so the UI can say "estimated 0, no projection data" instead
 *    of silently showing 0 with no explanation.
 */
import type { Reason } from "@sideline/shared";
import { scoreStatLine } from "./score.js";

/** The split-bucket league key an `fgm_50p` projection count is scored against (exception 1). */
export const FGM_50P_SOURCE_KEY = "fgm_50p";
export const FGM_50P_TARGET_RATE_KEY = "fgm_50_59";

/** League key for missed field goals and the projection fields that can approximate it. */
export const FGMISS_KEY = "fgmiss";
export const FGMISS_ATTEMPTS_KEY = "fga";
export const FGMISS_MAKES_KEY = "fgm";
export const FGMISS_BUCKET_KEYS = ["fgmiss_30_39", "fgmiss_40_49", "fgmiss_50p"] as const;

/** Raw DEF points-allowed mean key, read only when no bucket key is already present. */
export const PTS_ALLOW_MEAN_KEY = "pts_allow";

/**
 * DEF points-allowed buckets in boundary order (PLAN section 6 / ADR-002 item 3). Each bucket's
 * `max` is the highest points-allowed value (after flooring the mean) that maps to it; the last
 * bucket is unbounded above.
 */
export const DEF_PTS_ALLOW_BUCKETS: readonly { readonly key: string; readonly max: number }[] = [
  { key: "pts_allow_0", max: 0 },
  { key: "pts_allow_1_6", max: 6 },
  { key: "pts_allow_7_13", max: 13 },
  { key: "pts_allow_14_20", max: 20 },
  { key: "pts_allow_21_27", max: 27 },
  { key: "pts_allow_28_34", max: 34 },
  { key: "pts_allow_35p", max: Number.POSITIVE_INFINITY },
];

/** League keys that never appear in projection rows at all (exception 4). */
export const PROJECTION_UNAVAILABLE_KEYS = [
  "def_st_td",
  "def_st_ff",
  "def_st_fum_rec",
  "st_ff",
  "st_fum_rec",
  "fum_rec_td",
] as const;

/**
 * Maps a mean points-allowed value to the one DEF bucket Sleeper would have used, flooring first
 * (docs/sleeper-api-notes.md section 4.2: a projected mean of 20.5 maps to `pts_allow_14_20`,
 * not `pts_allow_21_27`). Negative means (should not happen) floor to the 0 bucket.
 */
export function defPointsAllowedBucket(meanPtsAllowed: number): string {
  const floored = Math.max(0, Math.floor(meanPtsAllowed));
  for (const bucket of DEF_PTS_ALLOW_BUCKETS) {
    if (floored <= bucket.max) return bucket.key;
  }
  // Unreachable: the last bucket's max is +Infinity.
  const last = DEF_PTS_ALLOW_BUCKETS[DEF_PTS_ALLOW_BUCKETS.length - 1];
  return last === undefined ? "pts_allow_35p" : last.key;
}

export interface RescoreProjectionInput {
  stats: Record<string, number>;
  scoringSettings: Record<string, number>;
}

export interface RescoreProjectionResult {
  points: number;
  reasons: Reason[];
}

/** Keys present in both the first argument as a Set helper to avoid repeated allocation. */
function keySet(obj: Record<string, number>): Set<string> {
  return new Set(Object.keys(obj));
}

/**
 * Rescores one projection row with the league's `scoring_settings`, applying the documented
 * SCORE-3 exceptions on top of the plain {@link scoreStatLine} formula. Pure: does not mutate
 * its inputs.
 */
export function rescoreProjection(input: RescoreProjectionInput): RescoreProjectionResult {
  const { stats, scoringSettings } = input;
  const reasons: Reason[] = [];
  let points = scoreStatLine(stats, scoringSettings);

  // Exception 1: fgm_50p -> fgm_50_59 rate, only when the split bucket isn't already present.
  const fgm50pCount = stats[FGM_50P_SOURCE_KEY];
  const fgm5059Rate = scoringSettings[FGM_50P_TARGET_RATE_KEY];
  if (
    fgm50pCount !== undefined &&
    fgm5059Rate !== undefined &&
    stats[FGM_50P_TARGET_RATE_KEY] === undefined
  ) {
    const impact = fgm50pCount * fgm5059Rate;
    points += impact;
    reasons.push({
      code: "FGM_50P_FROM_FGM_50_59",
      label: "50+ yard field goals scored at the 50-59 yard rate (projections can't split 60+)",
      value: fgm50pCount,
      impact,
    });
  }

  // Exception 2: fgmiss, only when the league scores it and it isn't already in the stats row.
  const fgmissRate = scoringSettings[FGMISS_KEY];
  if (fgmissRate !== undefined && stats[FGMISS_KEY] === undefined) {
    const fga = stats[FGMISS_ATTEMPTS_KEY];
    const fgm = stats[FGMISS_MAKES_KEY];
    if (fga !== undefined && fgm !== undefined) {
      const missCount = fga - fgm;
      const impact = missCount * fgmissRate;
      points += impact;
      reasons.push({
        code: "FGMISS_FROM_FGA_FGM",
        label: "Missed field goals estimated as attempts minus makes",
        value: missCount,
        impact,
      });
    } else {
      const presentBucketKeys = FGMISS_BUCKET_KEYS.filter((k) => stats[k] !== undefined);
      if (presentBucketKeys.length > 0) {
        const missCount = presentBucketKeys.reduce((sum, k) => sum + (stats[k] ?? 0), 0);
        const impact = missCount * fgmissRate;
        points += impact;
        reasons.push({
          code: "FGMISS_FROM_BUCKETS",
          label: "Missed field goals estimated from projected miss buckets",
          value: missCount,
          impact,
        });
      } else {
        reasons.push({
          code: "FGMISS_UNAVAILABLE",
          label: "No projection data for missed field goals; estimated 0",
          value: FGMISS_KEY,
          impact: 0,
        });
      }
    }
  }

  // Exception 3: DEF points-allowed bucket from the raw mean, only when no bucket key is present.
  const hasBucketKey = DEF_PTS_ALLOW_BUCKETS.some((b) => stats[b.key] !== undefined);
  const ptsAllowMean = stats[PTS_ALLOW_MEAN_KEY];
  if (!hasBucketKey && ptsAllowMean !== undefined) {
    const bucket = defPointsAllowedBucket(ptsAllowMean);
    const bucketRate = scoringSettings[bucket];
    if (bucketRate !== undefined) {
      points += bucketRate;
      reasons.push({
        code: "DEF_BUCKET_FROM_MEAN",
        label:
          "Points-allowed bucket estimated from the projected mean (a step-function approximation)",
        value: bucket,
        impact: bucketRate,
      });
    }
  }

  // Exception 4: keys that never appear in projection rows at all. Already 0 by the plain
  // formula; attach one reason per such key the league actually scores so the UI can explain it.
  const statsKeys = keySet(stats);
  for (const key of PROJECTION_UNAVAILABLE_KEYS) {
    if (scoringSettings[key] !== undefined && !statsKeys.has(key)) {
      reasons.push({
        code: "PROJECTION_KEY_UNAVAILABLE",
        label: "No projection data available for this stat; estimated 0",
        value: key,
        impact: 0,
      });
    }
  }

  return { points, reasons };
}
