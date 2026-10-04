/**
 * The shared materiality floor for lineup swap recommendations (LINEUP-6, LINEUP-5).
 *
 * A tiny positive point delta can be a tiebreak artifact (equal-value players) or float
 * noise, not a real gain. Below this floor, a nonzero delta is not worth presenting as an
 * actionable recommendation. Both the Home "This week" card and the Lineup page's summary
 * banner and swap list must agree on what counts, so they import this single constant and
 * helper rather than each defining their own copy of the threshold.
 */
export const LINEUP_MATERIALITY_FLOOR_PTS = 0.05;

/** Whether a lineup recommendation is worth presenting as actionable. */
export function hasMaterialSwaps(pointDelta: number, swapCount: number): boolean {
  return swapCount > 0 && pointDelta >= LINEUP_MATERIALITY_FLOOR_PTS;
}
