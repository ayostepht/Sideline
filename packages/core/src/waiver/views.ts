/**
 * WAIVER-4 (PLAN 5.6): the two ways a candidate list is browsed. Both are small, pure list
 * transforms (filter then sort) over candidates the caller has already scored elsewhere
 * (`computeLineupImpact` for Lineup Impact, `restOfSeasonProjection` for ROS value,
 * `computeWaiverScore` for the Waiver Score shown alongside each row) - this module performs no
 * analytics of its own.
 *
 * - **"For my team"**: sorted by Lineup Impact descending, so the player who helps *my* roster most
 *   right now is first.
 * - **"Best available"**: sorted by rest-of-season value descending, independent of Lineup Impact,
 *   so a strong player who would not currently start on my roster (a QB behind my starter, say)
 *   still ranks highly here.
 *
 * Both views accept an optional position filter (one or more positions); a candidate passes when
 * any of its `fantasyPositions` is in the filter set. An empty or omitted filter means "no filter".
 * An empty input candidate list returns an empty array, never an error.
 *
 * Ties are broken by ascending `playerId` so both views are fully deterministic given the same
 * input, matching the tiebreak convention already used by `prefilter.ts` and `lineup-impact.ts`.
 */

export interface WaiverViewCandidate {
  playerId: string;
  fantasyPositions: readonly string[];
  /** This candidate's Lineup Impact (WAIVER-2, `computeLineupImpact(...).impact`). */
  lineupImpact: number;
  /** This candidate's rest-of-season value (PROJ-4, `restOfSeasonProjection(...).points`). */
  rosValue: number;
}

/** True when `candidate` plays at least one position in `positions` (or `positions` is empty/omitted). */
function matchesPositionFilter(
  candidate: WaiverViewCandidate,
  positions: readonly string[] | undefined,
): boolean {
  if (positions === undefined || positions.length === 0) return true;
  const allowed = new Set(positions);
  return candidate.fantasyPositions.some((position) => allowed.has(position));
}

/** Ascending-`playerId` tiebreak shared by both views. */
function comparePlayerId(a: WaiverViewCandidate, b: WaiverViewCandidate): number {
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * WAIVER-4 "For my team": `candidates` filtered by `positions` (if given) and sorted by
 * `lineupImpact` descending, ties broken by ascending `playerId`.
 */
export function sortForMyTeam<T extends WaiverViewCandidate>(
  candidates: readonly T[],
  positions?: readonly string[],
): T[] {
  return candidates
    .filter((candidate) => matchesPositionFilter(candidate, positions))
    .sort((a, b) => {
      const diff = b.lineupImpact - a.lineupImpact;
      return diff !== 0 ? diff : comparePlayerId(a, b);
    });
}

/**
 * WAIVER-4 "Best available": `candidates` filtered by `positions` (if given) and sorted by
 * `rosValue` descending, ties broken by ascending `playerId`. Independent of `lineupImpact`.
 */
export function sortBestAvailable<T extends WaiverViewCandidate>(
  candidates: readonly T[],
  positions?: readonly string[],
): T[] {
  return candidates
    .filter((candidate) => matchesPositionFilter(candidate, positions))
    .sort((a, b) => {
      const diff = b.rosValue - a.rosValue;
      return diff !== 0 ? diff : comparePlayerId(a, b);
    });
}
