/**
 * WAIVER-2 (PLAN 5.6): Lineup Impact, the waiver wire's headline metric. For a single candidate,
 * it answers: how many projected starting points would I gain over the next `weeks.length` weeks
 * if I added this candidate and dropped the suggested (or an explicitly chosen) roster player?
 *
 * This module does not reimplement assignment or rest-of-season math. For each week it calls
 * {@link solveOptimalAssignment} exactly twice - once on the roster as-is, once on the roster with
 * the candidate added and the suggested drop removed - and sums `totalValue` deltas across weeks,
 * per the PLAN 5.6 WAIVER-2 formula. Roster slots come from {@link resolveSlots} applied to the
 * league's raw `roster_positions`. The suggested drop, when not given explicitly, is ranked by
 * {@link restOfSeasonProjection} (PROJ-4) rather than any new ROS math.
 *
 * ## Suggested drop
 * Defaults to the roster's lowest-ROS-value player with `isIR === false` (document: `isIR` is
 * whatever field the caller uses to mark a roster slot as IR/reserve, e.g. membership in a
 * league's `Roster.reserve` array - this module only reads the boolean it is handed). The caller
 * may override with `dropPlayerId`.
 *
 * The auto-selection never suggests dropping a player whose removal would leave some required
 * starting slot (per `resolveSlots(rosterPositions).slots`) with no eligible player left among the
 * rest of the non-IR roster - e.g. a roster's only DEF-eligible player in a league that starts a
 * DEF, even when that DEF happens to be the lowest-ROS-value player on the roster. This is a
 * feasibility check via {@link solveOptimalAssignment} (see `canFillAllSlots`/`pickAutoDrop`
 * below), not a per-position headcount, so it correctly accounts for shared flex eligibility. When
 * the full non-IR roster cannot itself fill every required slot (a pre-existing gap, not one this
 * drop would cause), the restriction is skipped and the plain lowest-ROS-value pick is used.
 *
 * ## Degenerate "no legal drop" case
 * Two situations produce no drop rather than a crash, both reported via a `Reason`:
 * - No `dropPlayerId` is given and every roster player is IR (or the roster is empty): there is no
 *   non-IR player to suggest dropping (`NO_LEGAL_DROP`).
 * - An explicit `dropPlayerId` is given but does not match any roster player id
 *   (`DROP_PLAYER_NOT_ON_ROSTER`).
 *
 * In both cases `droppedPlayerId` is `null` and the candidate is evaluated as a pure add (full
 * roster + candidate) against the roster as-is, with no player removed. This is not merely a safe
 * fallback: because a lowest-ROS-value bench player would not have been selected by the optimizer
 * for a starting slot anyway (in the typical case), dropping them changes `totalValue` by exactly
 * 0 versus not dropping anyone - so "pure add" already matches the normal-case arithmetic almost
 * always, and differs only in the rare case where the suggested drop would otherwise have started.
 *
 * ## IR players in the solve
 * `roster` may include IR players (their `isIR: true` flag is what the auto-drop selection reads).
 * This module does not separately zero out or exclude them before calling
 * {@link solveOptimalAssignment}: it relies on the same convention `solve.ts` already documents for
 * every unavailable player (Out/IR/Suspended/bye) - the caller pre-zeros `weeklyValues` for weeks
 * that player cannot contribute to. A zero (or negative) value can never be chosen by the solver
 * over leaving a slot empty (see `solve.ts`'s tiebreak doc), so an IR player with a correctly
 * zeroed value is harmless to include in the pool.
 */
import type { Reason } from "@sideline/shared";
import { resolveSlots, type SlotSpec } from "../optimizer/eligibility.js";
import { solveOptimalAssignment, type AssignmentPlayer } from "../optimizer/solve.js";
import {
  restOfSeasonProjection,
  type RestOfSeasonProjectionInput,
} from "../projections/rest-of-season.js";

/** Default number of upcoming weeks Lineup Impact is summed over (WAIVER-2's "next N weeks"). */
export const DEFAULT_LINEUP_IMPACT_WEEK_COUNT = 3;

export interface LineupImpactRosterPlayer {
  playerId: string;
  fantasyPositions: readonly string[];
  /** True when this roster player is on IR/reserve; never auto-selected as the suggested drop. */
  isIR: boolean;
  /**
   * This player's projected value (same units the caller uses for the optimizer, e.g. a base or
   * mode-adjusted projection) for each week being evaluated, keyed by week number. A week absent
   * from this map is treated as 0 (bye or no projection), matching the solver's "no entry = 0"
   * convention (`AssignmentInput.values`).
   */
  weeklyValues: Readonly<Record<number, number>>;
  /** Rest-of-season projection input (PROJ-4), used only to rank candidates for the auto-selected drop. */
  rosInput: RestOfSeasonProjectionInput;
}

export interface LineupImpactCandidate {
  playerId: string;
  fantasyPositions: readonly string[];
  /** Same convention as {@link LineupImpactRosterPlayer.weeklyValues}. */
  weeklyValues: Readonly<Record<number, number>>;
}

export interface LineupImpactInput {
  /** League's raw `roster_positions`; resolved internally via `resolveSlots` (LINEUP-1). */
  rosterPositions: readonly string[];
  /** The caller's full roster pool (bench and starters), excluding the candidate itself. */
  roster: readonly LineupImpactRosterPlayer[];
  candidate: LineupImpactCandidate;
  /** Week numbers to evaluate and sum over; the caller builds this list (default length 3). */
  weeks: readonly number[];
  /** Explicit drop override. When omitted, the lowest-ROS-value non-IR roster player is used. */
  dropPlayerId?: string;
}

export interface LineupImpactWeekResult {
  week: number;
  /** Optimal lineup value with the roster as-is. */
  currentValue: number;
  /** Optimal lineup value with the candidate added and the suggested drop (if any) removed. */
  withCandidateValue: number;
  delta: number;
}

export interface LineupImpactResult {
  /** Sum of every week's `delta` (the WAIVER-2 headline number). */
  impact: number;
  weeklyImpact: readonly LineupImpactWeekResult[];
  /** The roster player removed before evaluating the "with candidate" lineup, or null if none. */
  droppedPlayerId: string | null;
  reasons: Reason[];
}

/**
 * Asserts `arr[index]` is defined. Mirrors the identical helper in `optimizer/solve.ts` and
 * `optimizer/recommend.ts`: every call site here indexes within a loop bound derived from the same
 * array's length (or a just-checked non-empty array), so the thrown branch is unreachable in
 * practice; this keeps the invariant checked under `noUncheckedIndexedAccess` instead of relying
 * on a non-null assertion.
 */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  }
  return value;
}

/** Picks the roster player with the lowest ROS value (ties broken by ascending `playerId`). */
function pickLowestRosValue(
  candidates: readonly LineupImpactRosterPlayer[],
): LineupImpactRosterPlayer {
  // `candidates` is checked non-empty by both call sites before calling this.
  let lowest = at(candidates, 0);
  let lowestValue = restOfSeasonProjection(lowest.rosInput).points;
  for (let i = 1; i < candidates.length; i++) {
    const player = at(candidates, i);
    const value = restOfSeasonProjection(player.rosInput).points;
    if (value < lowestValue || (value === lowestValue && player.playerId < lowest.playerId)) {
      lowest = player;
      lowestValue = value;
    }
  }
  return lowest;
}

function toAssignmentPlayer(player: {
  playerId: string;
  fantasyPositions: readonly string[];
}): AssignmentPlayer {
  return { playerId: player.playerId, fantasyPositions: player.fantasyPositions };
}

/**
 * Feasibility-only constant used in {@link canFillAllSlots}: every candidate gets the same
 * strictly positive value so the Hungarian solver's eligibility-driven assignment is exercised
 * with no preference between players, only "is there a legal full assignment at all".
 */
const FEASIBILITY_CHECK_VALUE = 1;

/**
 * True iff every slot in `slots` can be filled by a distinct eligible player drawn from `players`
 * (a feasible complete lineup exists with this exact player pool). Reuses
 * {@link solveOptimalAssignment} as a pure feasibility check: every candidate is given the same
 * constant positive value (so the solver has no reason to leave a fillable slot empty in favor of
 * a "better" player elsewhere - see `solve.ts`'s tiebreak doc, a positive value always beats
 * leaving a slot empty), so the result fills every fillable slot iff a feasible assignment exists.
 */
function canFillAllSlots(
  players: readonly { playerId: string; fantasyPositions: readonly string[] }[],
  slots: readonly SlotSpec[],
): boolean {
  if (slots.length === 0) {
    return true;
  }
  const values: Record<string, number> = {};
  for (const player of players) {
    values[player.playerId] = FEASIBILITY_CHECK_VALUE;
  }
  const { assignments } = solveOptimalAssignment({
    slots,
    players: players.map(toAssignmentPlayer),
    values,
  });
  return assignments.every((assignment) => assignment.playerId !== null);
}

/**
 * WAIVER-2 bug fix: picks the auto-selected drop from `nonIR`, never choosing a player whose
 * removal would leave some required starting slot (per `slots`) unfillable by the rest of the
 * non-IR roster - e.g. a roster's only DEF-eligible player in a league that starts a DEF, where
 * that DEF also happens to be the roster's lowest-ROS-value player.
 *
 * Only restricts the pool when the full non-IR roster is itself feasible (every slot can be
 * filled today). When the roster is already short-staffed at some slot before any drop (a
 * pre-existing gap this drop isn't causing - PLAN 5.6 requirement 3), every candidate would fail
 * the "safe" filter, which is wrong; in that case this falls back to the plain unrestricted
 * lowest-ROS-value pick (the pre-fix behavior).
 */
function pickAutoDrop(
  nonIR: readonly LineupImpactRosterPlayer[],
  slots: readonly SlotSpec[],
): { player: LineupImpactRosterPlayer; constrained: boolean } {
  if (!canFillAllSlots(nonIR, slots)) {
    // Already infeasible with everyone rostered: no drop could be "unsafe" relative to this
    // pre-existing gap, so fall back to the original unrestricted selection.
    return { player: pickLowestRosValue(nonIR), constrained: false };
  }

  const safeCandidates = nonIR.filter((candidate) => {
    const remaining = nonIR.filter((player) => player.playerId !== candidate.playerId);
    return canFillAllSlots(remaining, slots);
  });

  // The full roster is feasible, so dropping no one is always "safe" in that degenerate sense;
  // `safeCandidates` can only be empty if `nonIR` itself has exactly 0 players, but that case is
  // handled by the caller before `pickAutoDrop` is invoked.
  const pool = safeCandidates.length > 0 ? safeCandidates : nonIR;
  return { player: pickLowestRosValue(pool), constrained: pool.length < nonIR.length };
}

/** WAIVER-2: computes Lineup Impact for one candidate across `input.weeks`. */
export function computeLineupImpact(input: LineupImpactInput): LineupImpactResult {
  const { rosterPositions, roster, candidate, weeks, dropPlayerId } = input;
  const { slots, warnings } = resolveSlots(rosterPositions);
  const reasons: Reason[] = [...warnings];

  const rosterById = new Map(roster.map((player) => [player.playerId, player]));

  let droppedPlayerId: string | null = null;
  if (dropPlayerId !== undefined) {
    if (rosterById.has(dropPlayerId)) {
      droppedPlayerId = dropPlayerId;
      reasons.push({
        code: "SUGGESTED_DROP",
        label: "You chose this player to drop (override)",
        value: dropPlayerId,
      });
    } else {
      reasons.push({
        code: "DROP_PLAYER_NOT_ON_ROSTER",
        label: "That player isn't on your roster, so we're evaluating this as a straight add",
        value: dropPlayerId,
      });
    }
  } else {
    const nonIR = roster.filter((player) => !player.isIR);
    if (nonIR.length === 0) {
      reasons.push({
        code: "NO_LEGAL_DROP",
        label: "No one on your roster can be dropped, so we're evaluating this as a straight add",
      });
    } else {
      droppedPlayerId = pickAutoDrop(nonIR, slots).player.playerId;
      reasons.push({
        code: "SUGGESTED_DROP",
        label: "We suggest dropping your lowest-value player for the rest of the season",
        value: droppedPlayerId,
      });
    }
  }

  const withCandidateRoster =
    droppedPlayerId === null
      ? roster
      : roster.filter((player) => player.playerId !== droppedPlayerId);

  const weeklyImpact: LineupImpactWeekResult[] = [];
  let impact = 0;

  for (const week of weeks) {
    const currentPlayers = roster.map(toAssignmentPlayer);
    const currentValues: Record<string, number> = {};
    for (const player of roster) {
      currentValues[player.playerId] = player.weeklyValues[week] ?? 0;
    }
    const currentResult = solveOptimalAssignment({
      slots,
      players: currentPlayers,
      values: currentValues,
    });

    const withCandidatePlayers = [
      ...withCandidateRoster.map(toAssignmentPlayer),
      toAssignmentPlayer(candidate),
    ];
    const withCandidateValues: Record<string, number> = {};
    for (const player of withCandidateRoster) {
      withCandidateValues[player.playerId] = player.weeklyValues[week] ?? 0;
    }
    withCandidateValues[candidate.playerId] = candidate.weeklyValues[week] ?? 0;
    const withCandidateResult = solveOptimalAssignment({
      slots,
      players: withCandidatePlayers,
      values: withCandidateValues,
    });

    const delta = withCandidateResult.totalValue - currentResult.totalValue;
    weeklyImpact.push({
      week,
      currentValue: currentResult.totalValue,
      withCandidateValue: withCandidateResult.totalValue,
      delta,
    });
    impact += delta;
  }

  return { impact, weeklyImpact, droppedPlayerId, reasons };
}
