export type Trend = "rising" | "steady" | "falling";

export const TREND_LABEL: Record<Trend, string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling",
};

export function trendLabel(trend: Trend): string {
  return TREND_LABEL[trend];
}

/** Maps a signed change to a trend. Changes within +/- threshold count as steady. */
export function trendFromDelta(delta: number, threshold = 0.5): Trend {
  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "steady";
}
