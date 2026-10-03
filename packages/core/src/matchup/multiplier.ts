/**
 * MATCH-2 (PLAN 5.3): matchup multiplier applied to a player's projection.
 *
 *   m = 1 + alpha * (dvpOppPos / avgPos - 1)
 *     + beta * (impliedTeamTotal / leagueAvgTotal - 1)   [optional implied-total term]
 *
 * `m` is capped to [MULTIPLIER_MIN, MULTIPLIER_MAX]. `alpha` and `beta` are tuned by the MATCH-3
 * backtest (see {@link DEFAULT_MATCHUP_ADJUSTMENT_CONFIG} in ./config.js) and default to 0, which
 * makes `m` identically 1 (matchup grades shown as context only, no projection adjustment).
 */
import type { Reason } from "@sideline/shared";

export const MULTIPLIER_MIN = 0.85;
export const MULTIPLIER_MAX = 1.15;

export interface MatchupMultiplierInput {
  dvpOppPos: number;
  avgPos: number;
  alpha: number;
  impliedTeamTotal?: number;
  leagueAvgTotal?: number;
  beta?: number;
}

export interface MatchupMultiplierResult {
  multiplier: number;
  reasons: Reason[];
}

export function matchupMultiplier(input: MatchupMultiplierInput): MatchupMultiplierResult {
  const { dvpOppPos, avgPos, alpha, impliedTeamTotal, leagueAvgTotal, beta } = input;
  const reasons: Reason[] = [];

  let m = 1;

  if (avgPos === 0) {
    reasons.push({
      code: "MATCHUP_AVG_POS_UNAVAILABLE",
      label: "Position average unavailable, matchup term skipped",
      value: avgPos,
    });
  } else {
    m += alpha * (dvpOppPos / avgPos - 1);
  }

  if (impliedTeamTotal !== undefined && leagueAvgTotal !== undefined && beta !== undefined) {
    if (leagueAvgTotal !== 0) {
      m += beta * (impliedTeamTotal / leagueAvgTotal - 1);
    }
  }

  const clamped = Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, m));
  if (clamped !== m) {
    reasons.push({
      code: "MATCHUP_MULTIPLIER_CLAMPED",
      label: "Matchup adjustment capped to keep projections reasonable",
      value: m,
    });
  }

  return { multiplier: clamped, reasons };
}
