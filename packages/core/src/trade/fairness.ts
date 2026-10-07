/**
 * TRADE-4 (ADR-022 item 6): fairness label from the two teams' ROS lineup gains.
 * Both gains > 0: ratio = min / max. ratio >= 0.75 fair; >= 0.4 leans toward the bigger gainer
 * (`leans_you` if mine is larger, else `leans_them`); below 0.4 lopsided. Otherwise (either gain
 * <= 0) lopsided. A fairness signal, not an acceptance prediction.
 */
import { TRADE_FAIR_RATIO_MIN, TRADE_LEANS_RATIO_MIN, type TradeFairness } from "@sideline/shared";

export function tradeFairness(myGain: number, theirGain: number): TradeFairness {
  if (!(myGain > 0) || !(theirGain > 0)) return "lopsided";
  const ratio = Math.min(myGain, theirGain) / Math.max(myGain, theirGain);
  if (ratio >= TRADE_FAIR_RATIO_MIN) return "fair";
  if (ratio >= TRADE_LEANS_RATIO_MIN) return myGain > theirGain ? "leans_you" : "leans_them";
  return "lopsided";
}
