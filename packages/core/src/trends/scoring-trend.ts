/**
 * TREND-1 (PLAN 5.5): per-player scoring trend. Computes season PPG, "last 3 weeks" (L3) PPG,
 * the delta between them, and returns the full weekly series (sorted ascending by week) so
 * callers can chart it.
 *
 * The caller is responsible for filtering the input down to weeks the player actually played
 * (byes, DNPs, and pre-roster weeks are excluded before calling this function); this module has
 * no way to distinguish "didn't play" from "scored zero" otherwise.
 */
import type { Reason } from "@sideline/shared";

/** Number of trailing weeks used for the "recent form" window (TREND-1). */
export const TREND_L3_WINDOW = 3;

export interface ScoringWeek {
  week: number;
  /** League-scored points actually earned this week. */
  actualPts: number;
}

export interface ScoringTrendInput {
  /** Weeks the player actually played, any order. Caller pre-filters byes/DNPs. */
  weeklyPoints: readonly ScoringWeek[];
}

export interface ScoringTrendResult {
  /** Mean points per game across every supplied week, or null when no weeks are supplied. */
  seasonPpg: number | null;
  /** Mean points per game across the last {@link TREND_L3_WINDOW} weeks (or fewer, if the player
   * has played less than that), or null when no weeks are supplied. */
  l3Ppg: number | null;
  /** `l3Ppg - seasonPpg`, or null when either side is null. */
  l3Delta: number | null;
  /** Defensive copy of the input, sorted ascending by week. */
  weeklySeries: ScoringWeek[];
  /** Count of weeks supplied (games played). */
  gamesPlayed: number;
  reasons: Reason[];
}

export function computeScoringTrend(input: ScoringTrendInput): ScoringTrendResult {
  const weeklySeries = [...input.weeklyPoints].sort((a, b) => a.week - b.week);
  const gamesPlayed = weeklySeries.length;

  if (gamesPlayed === 0) {
    return {
      seasonPpg: null,
      l3Ppg: null,
      l3Delta: null,
      weeklySeries,
      gamesPlayed,
      reasons: [
        {
          code: "TREND_NO_GAMES_PLAYED",
          label: "No games played yet this season",
          value: 0,
        },
      ],
    };
  }

  const seasonPpg = weeklySeries.reduce((sum, w) => sum + w.actualPts, 0) / gamesPlayed;
  const l3Weeks = weeklySeries.slice(-Math.min(TREND_L3_WINDOW, gamesPlayed));
  const l3Ppg = l3Weeks.reduce((sum, w) => sum + w.actualPts, 0) / l3Weeks.length;
  const l3Delta = l3Ppg - seasonPpg;

  const reasons: Reason[] = [];
  if (gamesPlayed < TREND_L3_WINDOW) {
    reasons.push({
      code: "TREND_L3_SMALL_SAMPLE",
      label: `Fewer than ${TREND_L3_WINDOW} games played; L3 uses all available games`,
      value: gamesPlayed,
    });
  }

  return { seasonPpg, l3Ppg, l3Delta, weeklySeries, gamesPlayed, reasons };
}
