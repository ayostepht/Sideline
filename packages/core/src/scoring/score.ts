/**
 * SCORE-1 (PLAN 5.1): league-faithful scoring engine.
 *
 * Formula: `sum(stats[k] * scoringSettings[k])` over every key present in both `stats` and
 * `scoringSettings`. A key missing from either side contributes 0 (Sleeper omits zero-valued
 * stats, so "missing" and "zero" are the same thing). There is no key allowlist: any key a
 * league scores (including IDP or bonus keys this app has never seen) is scored automatically
 * as long as the stats provider returns it.
 *
 * Verified against Sleeper's own `players_points` for 457 of 457 player-weeks, weeks 1 to 3,
 * starters and bench, including K and DEF (docs/sleeper-api-notes.md section 5, ADR-002 item 2).
 * No stat-key mapping exceptions are needed for actual stats; exceptions only apply to
 * projection rescoring (SCORE-3, see `rescore-projection.ts`), because projection rows use a
 * coarser stat vocabulary than final stats.
 */

/**
 * Sums `stats[k] * scoringSettings[k]` for every key present in both records. Never mutates
 * its inputs. Returns 0 for empty inputs (no stats, no scoring settings, or no overlap).
 */
export function scoreStatLine(
  stats: Record<string, number>,
  scoringSettings: Record<string, number>,
): number {
  let total = 0;
  for (const key of Object.keys(scoringSettings)) {
    const statValue = stats[key];
    const weight = scoringSettings[key];
    if (statValue === undefined || weight === undefined) continue;
    total += statValue * weight;
  }
  return total;
}
