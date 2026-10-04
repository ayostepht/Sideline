import type { LeagueIntelligenceTeam } from "@sideline/shared";

/**
 * T5.5b: formatting and small sort/filter helpers for the League page's intelligence sections
 * (power rankings, all-play/luck, manager tendencies, playoff odds). Mirrors the house convention
 * of small, locally duplicated formatters (see the sibling `_components/format.ts`'s own doc on
 * `formatSignedPoints`) rather than a shared formatting module.
 */

/** A [0, 1] rate as a whole-number percentage, e.g. 0.542 -> "54%". */
export function formatRatePercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** A composite score already scaled to [0, 1] (LEAGUE-3's `powerScore.score`) shown on a friendlier
 * 0-100 scale with one decimal, e.g. 0.642 -> "64.2". */
export function formatPowerScore(score: number): string {
  return (score * 100).toFixed(1);
}

/** One decimal, always signed, no unit suffix (luck and playoff-odds deltas read as plain win
 * counts, not points, so this intentionally differs from the sibling `formatSignedPoints`). */
export function formatSignedNumber(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  return n < 0 ? `-${abs}` : `+${abs}`;
}

/** Whole-dollar FAAB amount, e.g. 42 -> "$42". Caller must only pass non-null FAAB fields: a
 * non-FAAB league's `null` fields are a distinct "not applicable" state the UI handles separately. */
export function formatFaab(n: number): string {
  return `$${Math.round(n)}`;
}

/** Power rankings order (LEAGUE-3): highest composite score first. */
export function sortByPowerScoreDesc(
  teams: readonly LeagueIntelligenceTeam[],
): LeagueIntelligenceTeam[] {
  return [...teams].sort((a, b) => b.powerScore.score - a.powerScore.score);
}

/** Playoff odds order (LEAGUE-5): highest playoff percentage first. Teams without odds (see the
 * page's own null-handling) are not included here; callers filter those out first. */
export function sortByPlayoffPctDesc(
  teams: readonly { rosterId: number; playoffPct: number }[],
): { rosterId: number; playoffPct: number }[] {
  return [...teams].sort((a, b) => b.playoffPct - a.playoffPct);
}
