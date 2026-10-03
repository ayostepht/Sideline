/**
 * TREND-4 (PLAN 5.5): Rising / Steady / Falling trend signal.
 *
 * Decoupling (ADR-015 item 2): this function takes `l3Delta` and `usageDelta` as plain numbers,
 * not objects computed by re-deriving them from TREND-1/TREND-2's raw inputs. It never imports
 * `scoring-trend.ts` or `usage-trend.ts`. Callers run TREND-1 and (when usage data exists)
 * TREND-2 themselves and pass the two deltas in.
 *
 * Thresholds (no existing precedent in this codebase; chosen and documented here):
 *
 * - Points signal: `l3Delta` (points per game) is compared against a "steady band" of
 *   `max(|seasonPpg| * POINTS_STEADY_BAND_PCT, POINTS_STEADY_BAND_MIN)` points. A 15% swing
 *   relative to the player's own season average scales the band to the player's scoring level
 *   (a 1-point swing matters more for a 5-PPG kicker than a 25-PPG RB1), with a 2-point floor so
 *   very low scorers (or a 0 season PPG) still get a sane minimum band instead of a band of 0.
 *   `l3Delta > band` is Rising, `l3Delta < -band` is Falling, otherwise Steady.
 * - Usage signal (only when `usageDelta` is not null): compared against a fixed
 *   `USAGE_STEADY_BAND` of 0.03 (3 percentage points of share/snap%, or 3 red zone touches for
 *   the `rzTouches` field, whichever field the caller derived the delta from). Same Rising /
 *   Steady / Falling rule.
 * - Combination: when `usageDelta` is null (no nflverse data, or a usage-irrelevant position),
 *   the result is the points signal alone (TREND-4's documented fallback). Otherwise: if the two
 *   signals agree, that is the result. If one of the two is Steady, the other (non-Steady) signal
 *   wins (a real move in one dimension is enough to call a direction even if the other dimension
 *   hasn't caught up yet). If they actively conflict (one Rising, one Falling), the result is
 *   Steady: the two best signals available disagree, so calling a direction would be overconfident.
 */
import type { Reason } from "@sideline/shared";

export type TrendSignal = "Rising" | "Steady" | "Falling";

/** Points steady-band width, as a fraction of the player's season PPG (TREND-4). */
export const POINTS_STEADY_BAND_PCT = 0.15;
/** Minimum points steady-band width, in points per game, for low scorers (TREND-4). */
export const POINTS_STEADY_BAND_MIN = 2;
/** Usage steady-band width, in share units (0 to 1) or raw count for `rzTouches` (TREND-4). */
export const USAGE_STEADY_BAND = 0.03;

export interface TrendSignalInput {
  /** L3 PPG minus season PPG (TREND-1's `l3Delta`), as a plain number. */
  l3Delta: number;
  /** L3-window usage value minus prior-weeks usage value for the relevant field (TREND-2's
   * `delta`), as a plain number, or null when no usage data applies. */
  usageDelta: number | null;
  /** The player's season PPG, used only to scale the points steady band to their scoring level. */
  seasonPpg: number;
}

export interface TrendSignalResult {
  signal: TrendSignal;
  reasons: Reason[];
}

function signalFromDelta(delta: number, band: number): TrendSignal {
  if (delta > band) {
    return "Rising";
  }
  if (delta < -band) {
    return "Falling";
  }
  return "Steady";
}

export function computeTrendSignal(input: TrendSignalInput): TrendSignalResult {
  const { l3Delta, usageDelta, seasonPpg } = input;
  const pointsBand = Math.max(Math.abs(seasonPpg) * POINTS_STEADY_BAND_PCT, POINTS_STEADY_BAND_MIN);
  const pointsSignal = signalFromDelta(l3Delta, pointsBand);

  const reasons: Reason[] = [
    {
      code: "TREND_SIGNAL_POINTS_DELTA",
      label: "Points trend: last 3 weeks versus season average",
      impact: l3Delta,
    },
  ];

  if (usageDelta === null) {
    reasons.push({
      code: "TREND_SIGNAL_NO_USAGE_DATA",
      label: "No usage data available; trend is based on scoring only",
    });
    return { signal: pointsSignal, reasons };
  }

  const usageSignal = signalFromDelta(usageDelta, USAGE_STEADY_BAND);
  reasons.push({
    code: "TREND_SIGNAL_USAGE_DELTA",
    label: "Usage trend: last 3 weeks versus prior weeks",
    value: usageDelta,
  });

  if (pointsSignal === usageSignal) {
    return { signal: pointsSignal, reasons };
  }
  if (pointsSignal === "Steady") {
    return { signal: usageSignal, reasons };
  }
  if (usageSignal === "Steady") {
    return { signal: pointsSignal, reasons };
  }

  // One is Rising and the other is Falling: the two best signals disagree.
  reasons.push({
    code: "TREND_SIGNAL_CONFLICTING",
    label: "Scoring and usage trends disagree; showing Steady",
  });
  return { signal: "Steady", reasons };
}
