/**
 * LINEUP-3..LINEUP-6 (PLAN 5.4): the user-facing lineup recommendation. Composes
 * {@link applyAvailability} (LINEUP-4), {@link isLocked} (LINEUP-3), and
 * {@link solveOptimalAssignment} (LINEUP-2) into the full output shape: optimal vs current
 * lineup, the swap list, the projected point delta, and per-player/per-slot reasons.
 *
 * LINEUP-5 (Projected/Safe/Upside modes) needs no code here: `rawValue` on each
 * {@link RecommendLineupPlayer} is whatever quantity the caller already chose (median, floor, or
 * ceiling); this module is mode-agnostic by construction.
 *
 * LINEUP-6 solver stability fix: today's current lineup is passed to
 * {@link solveOptimalAssignment} as its optional `currentAssignment` stability hint (see
 * `recommendLineup`'s step d below and `solve.ts`'s "Solution stability" doc paragraph), so that
 * when several eligible players are tied in value across interchangeable slots (e.g. three
 * WR-eligible players tied in value across two WR slots and a FLEX slot), `swaps` and `pointDelta`
 * reflect only genuine improvements and never a meaningless chain of equally-valued swaps.
 */
import type { Reason } from "@sideline/shared";
import { applyAvailability } from "./availability.js";
import type { SlotSpec } from "./eligibility.js";
import { isLocked } from "./locks.js";
import { solveOptimalAssignment, type AssignmentPlayer, type SlotAssignment } from "./solve.js";

export interface RecommendLineupPlayer {
  playerId: string;
  fantasyPositions: readonly string[];
  /** The caller's chosen mode's value (median/floor/ceiling), before availability discounting. */
  rawValue: number;
  status: string | null;
  isBye: boolean;
  kickoffUtc: string | null;
  kickoffApproximate: boolean;
}

export interface RecommendLineupInput {
  slots: readonly SlotSpec[];
  /** Unknown-slot-type warnings from `resolveSlots`, passed straight through into `issues`. */
  slotWarnings: readonly Reason[];
  /** Eligible pool; the caller has already excluded IR/taxi rostered players. */
  players: readonly RecommendLineupPlayer[];
  /** Today's actual starters, parallel to `slots` by index; null = that slot is currently empty. */
  currentAssignment: ReadonlyArray<string | null>;
  now: Date;
}

export interface SwapEntry {
  slotIndex: number;
  slotType: string;
  playerIdIn: string | null;
  playerIdOut: string | null;
}

export interface RecommendLineupResult {
  optimalAssignment: readonly SlotAssignment[];
  /** Normalized echo of `currentAssignment`, parallel to `slots`. */
  currentAssignment: readonly SlotAssignment[];
  swaps: readonly SwapEntry[];
  /** Sum of optimal-assignment adjusted values minus sum of current-assignment adjusted values. */
  pointDelta: number;
  /** Availability and lock reasons per player id that has any. */
  playerReasons: Readonly<Record<string, readonly Reason[]>>;
  issues: readonly Reason[];
}

/**
 * Asserts `arr[index]` is defined. See the identical helper in `solve.ts`: every call site here
 * indexes within a loop bound derived from the same array's length, so the thrown branch is
 * unreachable in practice; this keeps the invariant checked under `noUncheckedIndexedAccess`
 * instead of relying on a non-null assertion.
 */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  }
  return value;
}

interface Processed {
  adjustedValue: number;
  reasons: Reason[];
  locked: boolean;
}

/**
 * LINEUP-6: builds the full lineup recommendation. See the module doc and PLAN 5.4 for the
 * algorithm; summarized: (a) discount each eligible player's value for availability and resolve
 * their lock status; (b) a slot whose current starter is locked is pinned to that starter and
 * removed from the solver; (c) every locked player (starting or benched) is excluded from the
 * solver entirely - their fate is already fully determined by (b), and leaving a locked current
 * starter in the pool would let the solver also assign them into a second, non-locked slot,
 * duplicating them in the output; (d) solve the remaining slots/players exactly, passing each
 * solver slot's current incumbent through to {@link solveOptimalAssignment}'s optional
 * `currentAssignment` stability hint (see that module's "Solution stability" doc paragraph) so
 * that when several players are tied in value across interchangeable slots (e.g. WR/FLEX overlap),
 * the solver reports the player's actual current lineup rather than a different-but-equal-value
 * permutation - without this, step f below could report a chain of "swaps" that nets to exactly
 * zero `pointDelta`, which is confusing and not a real recommendation;
 * (e)-(i) assemble the echo of today's lineup, the swap list, the point delta, per-player reasons,
 * and the issues list (unknown slot types, empty slots, inactive current starters).
 */
export function recommendLineup(input: RecommendLineupInput): RecommendLineupResult {
  const { slots, slotWarnings, players, currentAssignment, now } = input;

  // Step a: adjusted value, availability reasons, and lock status for every eligible player.
  const processedById = new Map<string, Processed>();
  for (const player of players) {
    const availability = applyAvailability({
      status: player.status,
      isBye: player.isBye,
      rawValue: player.rawValue,
    });
    const locked = isLocked(
      { kickoffUtc: player.kickoffUtc, kickoffApproximate: player.kickoffApproximate },
      now,
    );
    const reasons: Reason[] = [...availability.reasons];
    if (locked) {
      reasons.push(
        player.kickoffApproximate
          ? {
              code: "LOCKED",
              label: "Game has already started (kickoff time is estimated)",
              value: "approximate",
            }
          : { code: "LOCKED", label: "Game has already started" },
      );
    }
    processedById.set(player.playerId, { adjustedValue: availability.value, reasons, locked });
  }

  const currentPlayerIdBySlot: ReadonlyArray<string | null> = slots.map(
    (_slot, i) => currentAssignment[i] ?? null,
  );

  // Step b: a slot is locked iff its current starter exists and is locked.
  const lockedSlotIndexes = new Set<number>();
  currentPlayerIdBySlot.forEach((currentPlayerId, i) => {
    if (currentPlayerId === null) return;
    const processed = processedById.get(currentPlayerId);
    if (processed !== undefined && processed.locked) {
      lockedSlotIndexes.add(i);
    }
  });

  // Step c: every locked player's fate is already fully determined - pinned to their current
  // slot via `lockedSlotIndexes` above if they are a current starter, otherwise simply
  // unavailable - so every locked player (starting or benched) is excluded from the solver pool.
  // Without this, a locked current starter could also be assigned by the solver into a second,
  // non-locked slot they're eligible for, duplicating them in the output (LINEUP-8).
  const lockedAndBenchedIds = new Set<string>();
  for (const [playerId, processed] of processedById) {
    if (processed.locked) {
      lockedAndBenchedIds.add(playerId);
    }
  }

  // Step d: solve only the non-locked slots against the remaining eligible players.
  const solverSlots: SlotSpec[] = [];
  const solverSlotOriginalIndex: number[] = [];
  slots.forEach((slot, i) => {
    if (!lockedSlotIndexes.has(i)) {
      solverSlots.push(slot);
      solverSlotOriginalIndex.push(i);
    }
  });

  const solverPlayers: AssignmentPlayer[] = [];
  const solverValues: Record<string, number> = {};
  for (const player of players) {
    if (lockedAndBenchedIds.has(player.playerId)) continue;
    solverPlayers.push({ playerId: player.playerId, fantasyPositions: player.fantasyPositions });
    solverValues[player.playerId] = processedById.get(player.playerId)?.adjustedValue ?? 0;
  }

  // Current incumbent for each solver slot (locked slots are pinned above, not passed to the
  // solver at all), so the solver's stability bonus (see solve.ts) prefers reporting today's
  // actual lineup over an equally-valued permutation of it.
  const solverCurrentAssignment: Array<string | null> = solverSlotOriginalIndex.map(
    (originalIndex) => at(currentPlayerIdBySlot, originalIndex),
  );

  const solveResult = solveOptimalAssignment({
    slots: solverSlots,
    players: solverPlayers,
    values: solverValues,
    currentAssignment: solverCurrentAssignment,
  });

  const optimalAssignment: SlotAssignment[] = slots.map((slot, i) => {
    if (lockedSlotIndexes.has(i)) {
      return { slotType: slot.slotType, playerId: at(currentPlayerIdBySlot, i) };
    }
    return { slotType: slot.slotType, playerId: null };
  });
  solverSlotOriginalIndex.forEach((originalIndex, solverIndex) => {
    optimalAssignment[originalIndex] = at(solveResult.assignments, solverIndex);
  });

  // Step e: normalized echo of today's actual lineup.
  const currentAssignmentOut: SlotAssignment[] = slots.map((slot, i) => ({
    slotType: slot.slotType,
    playerId: at(currentPlayerIdBySlot, i),
  }));

  // Step f: swap list, by slot index, wherever the final assignment differs from today's.
  const swaps: SwapEntry[] = [];
  slots.forEach((slot, i) => {
    const optimalPlayerId = at(optimalAssignment, i).playerId;
    const currentPlayerId = at(currentPlayerIdBySlot, i);
    if (optimalPlayerId !== currentPlayerId) {
      swaps.push({
        slotIndex: i,
        slotType: slot.slotType,
        playerIdIn: optimalPlayerId,
        playerIdOut: currentPlayerId,
      });
    }
  });

  // Step g: point delta from adjusted values; a current starter absent from the pool contributes 0.
  const adjustedValueOf = (playerId: string | null): number =>
    playerId === null ? 0 : (processedById.get(playerId)?.adjustedValue ?? 0);
  const optimalSum = optimalAssignment.reduce(
    (sum, assignment) => sum + adjustedValueOf(assignment.playerId),
    0,
  );
  const currentSum = currentPlayerIdBySlot.reduce(
    (sum, playerId) => sum + adjustedValueOf(playerId),
    0,
  );
  const pointDelta = optimalSum - currentSum;

  // Step h: per-player reasons (availability and/or lock), for any player that has at least one.
  const playerReasons: Record<string, readonly Reason[]> = {};
  for (const [playerId, processed] of processedById) {
    if (processed.reasons.length > 0) {
      playerReasons[playerId] = processed.reasons;
    }
  }

  // Step i: issues - unknown slot types (passed through), empty final slots, inactive starters.
  const issues: Reason[] = [...slotWarnings];
  optimalAssignment.forEach((assignment) => {
    if (assignment.playerId === null) {
      issues.push({
        code: "EMPTY_SLOT",
        label: `No one on your roster can fill ${assignment.slotType}`,
        value: assignment.slotType,
      });
    }
  });
  currentPlayerIdBySlot.forEach((playerId) => {
    if (playerId === null) return;
    const processed = processedById.get(playerId);
    const isUnavailable =
      processed?.reasons.some((reason) => reason.code === "UNAVAILABLE") ?? false;
    if (isUnavailable) {
      issues.push({
        code: "INACTIVE_STARTER",
        label: "Your current starter isn't available this week",
        value: playerId,
      });
    }
  });

  return {
    optimalAssignment,
    currentAssignment: currentAssignmentOut,
    swaps,
    pointDelta,
    playerReasons,
    issues,
  };
}
