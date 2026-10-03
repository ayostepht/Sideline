/**
 * MATCH-2/MATCH-3 (PLAN 5.3): shared alpha/beta configuration for {@link matchupMultiplier}.
 * PLAN 5.3's documented fallback is "otherwise set both to 0 and show matchup grades as context
 * only": until the MATCH-3 backtest (scripts/backtest/, a separate task) clears its 1%-MAE bar for
 * a tuned alpha/beta, both default to 0 so the multiplier is always 1.
 */

export interface MatchupAdjustmentConfig {
  alpha: number;
  beta: number;
}

export const DEFAULT_MATCHUP_ADJUSTMENT_CONFIG: MatchupAdjustmentConfig = { alpha: 0, beta: 0 };
