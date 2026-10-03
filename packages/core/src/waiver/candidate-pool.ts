/**
 * WAIVER-1 (PLAN 5.6): the waiver candidate pool. A pure filter over a caller-supplied player
 * list down to players that are (a) not on any roster in the league, (b) active, and (c) play a
 * position the league actually uses.
 *
 * ## Rostered check
 * The caller assembles `rosteredPlayerIds` from every roster's `players` field (Sleeper's
 * `Roster.players` already includes IR and taxi players - those are subsets of `players`, not a
 * separate pool - so including `reserve`/`taxi` alongside `players` is redundant but harmless; see
 * `docs/sleeper-api-notes.md` sections on `GET /league/{id}/rosters`). This module only consumes
 * the finished set; it does no roster assembly itself, keeping it agnostic of how many rosters or
 * leagues the caller is working with.
 *
 * ## Active status
 * `@sideline/shared`'s `Player.status` is a clean signal for this (`docs/sleeper-api-notes.md`:
 * observed values are `Active, Inactive, Injured Reserve, Physically Unable to Perform, Non
 * Football Injury, Practice Squad, null`). Only `ACTIVE_PLAYER_STATUS` ("Active") passes; every
 * other value, including `null` (unknown) and "Practice Squad" (not eligible to play, not a
 * realistic add), is excluded. This is a deliberate, documented choice, not a limitation: unlike
 * some shared types, `Player` does carry an unambiguous status field, so "not on any roster" alone
 * is not used as a fallback here.
 *
 * ## Position check
 * `eligiblePositions` is caller-supplied (e.g. the union of a league's `resolveSlots(...).slots`
 * eligible positions) so this module never imports league-settings parsing itself. A player
 * qualifies if any of their `fantasyPositions` is in that set, mirroring
 * `isPlayerEligibleForSlot`'s semantics in `optimizer/eligibility.ts` (not imported directly here
 * to avoid coupling this bulk filter to a single slot's eligibility list).
 */
import type { Player, Reason } from "@sideline/shared";

/** The only `Player.status` value treated as "active" for waiver eligibility (WAIVER-1). */
export const ACTIVE_PLAYER_STATUS = "Active";

export interface CandidatePoolInput {
  /** Every player the caller knows about (typically the full Sleeper player DB). */
  players: readonly Player[];
  /** Every player id rostered by any team in the league, including IR and taxi. */
  rosteredPlayerIds: ReadonlySet<string>;
  /** Positions the league actually uses, e.g. the union of eligible positions across its slots. */
  eligiblePositions: ReadonlySet<string>;
}

export interface CandidatePoolResult {
  candidates: readonly Player[];
  reasons: Reason[];
}

/**
 * WAIVER-1: filters `players` down to free-agent candidates. Order is preserved from the input.
 */
export function buildCandidatePool(input: CandidatePoolInput): CandidatePoolResult {
  const { players, rosteredPlayerIds, eligiblePositions } = input;

  const candidates: Player[] = [];
  let excludedRostered = 0;
  let excludedInactive = 0;
  let excludedPosition = 0;

  for (const player of players) {
    if (rosteredPlayerIds.has(player.playerId)) {
      excludedRostered += 1;
      continue;
    }
    if (player.status !== ACTIVE_PLAYER_STATUS) {
      excludedInactive += 1;
      continue;
    }
    const usesLeaguePosition = player.fantasyPositions.some((position) =>
      eligiblePositions.has(position),
    );
    if (!usesLeaguePosition) {
      excludedPosition += 1;
      continue;
    }
    candidates.push(player);
  }

  const reasons: Reason[] = [
    {
      code: "CANDIDATE_POOL_SIZE",
      label: `${candidates.length} free agents available at a position your league uses`,
      value: candidates.length,
    },
  ];
  if (excludedRostered > 0) {
    reasons.push({
      code: "EXCLUDED_ROSTERED",
      label: "Already on a roster (including IR and taxi)",
      value: excludedRostered,
    });
  }
  if (excludedInactive > 0) {
    reasons.push({
      code: "EXCLUDED_INACTIVE",
      label: "Not currently active in the NFL",
      value: excludedInactive,
    });
  }
  if (excludedPosition > 0) {
    reasons.push({
      code: "EXCLUDED_POSITION",
      label: "Plays a position your league doesn't use",
      value: excludedPosition,
    });
  }

  return { candidates, reasons };
}
