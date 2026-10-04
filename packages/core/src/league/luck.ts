/**
 * LEAGUE-2 (PLAN 5.8): luck = actual wins minus expected wins (sum of weekly all-play win rates).
 *
 *   luck = actualWins - sum(weeklyAllPlayWinRates)
 *
 * `weeklyAllPlayWinRates` is the per-week `winRate` from `computeAllPlayWeek`/
 * `computeAllPlaySeason` (`all-play.ts`, LEAGUE-1) for this team, one entry per week played.
 * Positive luck means the team's real win total is higher than its schedule-neutral all-play
 * performance predicts (it has been winning games it might have lost against a different
 * schedule); negative luck means the opposite. This module takes the win rates as a plain
 * `readonly number[]` rather than importing `all-play.ts`, so it can be unit-tested against
 * synthetic numbers independent of how the caller produced them.
 */
import type { Reason } from "@sideline/shared";

/** `actualWins - sum(weeklyAllPlayWinRates)` (LEAGUE-2). */
export function luck(actualWins: number, weeklyAllPlayWinRates: readonly number[]): number {
  const expectedWins = weeklyAllPlayWinRates.reduce((sum, rate) => sum + rate, 0);
  return actualWins - expectedWins;
}

export interface LuckResult {
  actualWins: number;
  /** Sum of weekly all-play win rates: how many wins this team's level of play "should" have
   * produced against a schedule-neutral opponent each week. */
  expectedWins: number;
  /** `actualWins - expectedWins`. Positive = overperforming the schedule; negative = underperforming. */
  luck: number;
  reasons: Reason[];
}

/** Same formula as `luck`, with the expected-wins breakdown and reasons for UI display. */
export function computeLuck(
  actualWins: number,
  weeklyAllPlayWinRates: readonly number[],
): LuckResult {
  const expectedWins = weeklyAllPlayWinRates.reduce((sum, rate) => sum + rate, 0);
  const luckValue = actualWins - expectedWins;

  const reasons: Reason[] = [
    {
      code: "LEAGUE_LUCK_EXPECTED_WINS",
      label: "Wins expected from all-play win rate (schedule-neutral)",
      value: expectedWins,
    },
  ];
  if (weeklyAllPlayWinRates.length === 0) {
    reasons.push({
      code: "LEAGUE_LUCK_NO_WEEKS",
      label: "No weeks played yet, so luck cannot be computed",
      value: 0,
    });
  }

  return { actualWins, expectedWins, luck: luckValue, reasons };
}
