/**
 * TREND-5 (PLAN 5.5): Sleeper trending adds/drops shown as momentum.
 *
 * Input is every `TrendingEntry` for a single player (the caller filters `trending/add` and
 * `trending/drop` responses down to one player before calling this; multiple entries can occur
 * if the caller fetched more than one lookback window, in which case counts are summed across
 * all supplied entries).
 *
 * Momentum formula: `netCount = addCount - drops` (net adds across all supplied entries). A
 * qualitative label is derived from fixed, documented thresholds on `netCount`:
 *
 * - `netCount >= MOMENTUM_HOT_THRESHOLD` (1000): "Hot"
 * - `netCount >= MOMENTUM_WARM_THRESHOLD` (100): "Warm"
 * - `netCount <= MOMENTUM_COLD_THRESHOLD` (-100): "Cold"
 * - otherwise: "Neutral"
 *
 * These thresholds are a starting point calibrated to Sleeper's typical waiver-week add/drop
 * volume (hundreds to low thousands for a hot free agent); they are exported constants so a
 * backtest or later tuning pass (T4.5) can adjust them without touching this module's logic.
 */
import type { Reason, TrendingEntry } from "@sideline/shared";

export type MomentumLabel = "Hot" | "Warm" | "Neutral" | "Cold";

/** Net-add threshold for the "Hot" label (TREND-5). */
export const MOMENTUM_HOT_THRESHOLD = 1000;
/** Net-add threshold for the "Warm" label (TREND-5). */
export const MOMENTUM_WARM_THRESHOLD = 100;
/** Net-add threshold (negative) for the "Cold" label (TREND-5). */
export const MOMENTUM_COLD_THRESHOLD = -100;

export interface TrendingMomentumInput {
  /** Every trending entry for a single player, any order, any number of lookback windows. */
  entries: readonly TrendingEntry[];
}

export interface TrendingMomentumResult {
  addCount: number;
  dropCount: number;
  /** `addCount - dropCount`. */
  netCount: number;
  label: MomentumLabel;
  reasons: Reason[];
}

function labelFromNetCount(netCount: number): MomentumLabel {
  if (netCount >= MOMENTUM_HOT_THRESHOLD) {
    return "Hot";
  }
  if (netCount >= MOMENTUM_WARM_THRESHOLD) {
    return "Warm";
  }
  if (netCount <= MOMENTUM_COLD_THRESHOLD) {
    return "Cold";
  }
  return "Neutral";
}

export function computeTrendingMomentum(input: TrendingMomentumInput): TrendingMomentumResult {
  const { entries } = input;
  const addCount = entries.filter((e) => e.type === "add").reduce((sum, e) => sum + e.count, 0);
  const dropCount = entries.filter((e) => e.type === "drop").reduce((sum, e) => sum + e.count, 0);
  const netCount = addCount - dropCount;
  const label = labelFromNetCount(netCount);

  const reasons: Reason[] = [
    {
      code: "TREND_MOMENTUM_ADDS",
      label: "Sleeper adds in the lookback window",
      value: addCount,
    },
    {
      code: "TREND_MOMENTUM_DROPS",
      label: "Sleeper drops in the lookback window",
      value: dropCount,
    },
  ];

  if (entries.length === 0) {
    reasons.push({
      code: "TREND_MOMENTUM_NO_DATA",
      label: "No Sleeper trending data available for this player",
    });
  }

  return { addCount, dropCount, netCount, label, reasons };
}
