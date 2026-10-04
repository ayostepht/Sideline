/**
 * LEAGUE-4 (PLAN 5.8): positional strength heatmap, each team's ROS projected starters total by
 * position versus the league median at that position.
 *
 * Inputs are plain, already-computed totals (`PositionalStrengthEntry`), one per team per
 * position: the caller runs the optimizer/rest-of-season projection and sums each team's optimal
 * starters' projection by position before calling this (this module never imports `optimizer/`
 * or `projections/`, per the package's decoupling convention -- see ADR-013 item 2).
 *
 * For each position present in the input, the league median across every team's value at that
 * position is computed (standard median: sort ascending, take the middle value, or the average
 * of the two middle values for an even team count). Each team's result at that position carries
 * two comparisons against that median:
 *
 * - `delta = value - median`: same units as the input (e.g. projected points), directly
 *   interpretable on a heatmap's color scale, and well-defined even when `median` is 0. This is
 *   the primary signal.
 * - `ratio = value / median`: unitless, so comparable across positions with very different raw
 *   scales (e.g. a QB position with a median of 280 vs. a DEF position with a median of 90);
 *   `null` when `median` is 0, since a ratio against zero has no meaningful value (flagged with
 *   reason `LEAGUE_HEATMAP_ZERO_MEDIAN`). This is a secondary, optional display figure (e.g. "1.2x
 *   the league median").
 *
 * A single-team "league" is a degenerate but reachable edge case (e.g. a test fixture, or a
 * commissioner running this before the rest of the league has synced): the median of one value is
 * that value itself, so every team's delta is trivially 0 and ratio is trivially 1 (or `null` if
 * that lone value is 0). No special-casing is needed; the median function below handles it.
 */
import type { Reason } from "@sideline/shared";

export interface PositionalStrengthEntry {
  rosterId: number;
  position: string;
  /** ROS projected total for this team's optimal starters at this position. */
  value: number;
}

export interface PositionalStrengthResult {
  rosterId: number;
  position: string;
  value: number;
  /** League median across every team's value at this position. */
  median: number;
  /** `value - median`. Primary heatmap signal; well-defined even when `median` is 0. */
  delta: number;
  /** `value / median`; `null` when `median` is 0. */
  ratio: number | null;
  reasons: Reason[];
}

// Only ever called below with a non-empty array (built from at least one entry per position in
// `computePositionalHeatmap`), so the indexed accesses are never actually `undefined`; the `?? 0`
// fallbacks are defensive only, not reachable through the public API.
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/** League-median positional comparison for every team and position present in `entries` (LEAGUE-4). */
export function computePositionalHeatmap(
  entries: readonly PositionalStrengthEntry[],
): PositionalStrengthResult[] {
  const byPosition = new Map<string, PositionalStrengthEntry[]>();
  for (const entry of entries) {
    const list = byPosition.get(entry.position) ?? [];
    list.push(entry);
    byPosition.set(entry.position, list);
  }

  const results: PositionalStrengthResult[] = [];
  for (const [position, teamEntries] of byPosition) {
    const positionMedian = median(teamEntries.map((e) => e.value));
    for (const entry of teamEntries) {
      const delta = entry.value - positionMedian;
      const reasons: Reason[] = [];
      let ratio: number | null = null;
      if (positionMedian === 0) {
        reasons.push({
          code: "LEAGUE_HEATMAP_ZERO_MEDIAN",
          label: `League median for ${position} is 0, so a ratio isn't meaningful`,
          value: 0,
        });
      } else {
        ratio = entry.value / positionMedian;
      }
      results.push({
        rosterId: entry.rosterId,
        position,
        value: entry.value,
        median: positionMedian,
        delta,
        ratio,
        reasons,
      });
    }
  }

  return results;
}
