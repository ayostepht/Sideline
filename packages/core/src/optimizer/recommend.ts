/**
 * LINEUP-3..LINEUP-6 (PLAN 5.4): the user-facing lineup recommendation. Composes
 * {@link applyAvailability} (LINEUP-4), {@link isLocked} (LINEUP-3), and
 * {@link solveOptimalAssignment} (LINEUP-2) into the full output shape: optimal vs current
 * lineup, the swap list, the projected point delta, and per-player/per-slot reasons.
 *
 * LINEUP-5 (Projected/Safe/Upside modes) needs no code here: `rawValue` on each
 * {@link RecommendLineupPlayer} is whatever quantity the caller already chose (median, floor, or
 * ceiling); this module is mode-agnostic by construction.
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
 * removed from the solver; (c) a locked player who is not a current starter is excluded from the
 * solver entirely (cannot be moved into a lineup); (d) solve the remaining slots/players exactly;
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
              label: "Locked: game has started (estimated kickoff time)",
              value: "approximate",
            }
          : { code: "LOCKED", label: "Locked: game has started" },
      );
    }
    processedById.set(player.playerId, { adjustedValue: availability.value, reasons, locked });
  }

  const currentPlayerIdBySlot: ReadonlyArray<string | null> = slots.map(
    (_slot, i) => currentAssignment[i] ?? null,
  );

  // Step b: a slot is locked iff its current starter exists and is locked.
  const lockedSlotIndexes = new Set<number>();
  const startingPlayerIds = new Set<string>();
  for (const currentPlayerId of currentPlayerIdBySlot) {
    if (currentPlayerId !== null) {
      startingPlayerIds.add(currentPlayerId);
    }
  }
  currentPlayerIdBySlot.forEach((currentPlayerId, i) => {
    if (currentPlayerId === null) return;
    const processed = processedById.get(currentPlayerId);
    if (processed !== undefined && processed.locked) {
      lockedSlotIndexes.add(i);
    }
  });

  // Step c: a locked player who is not currently starting anywhere cannot be moved in.
  const lockedAndBenchedIds = new Set<string>();
  for (const [playerId, processed] of processedById) {
    if (processed.locked && !startingPlayerIds.has(playerId)) {
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

  const solveResult = solveOptimalAssignment({
    slots: solverSlots,
    players: solverPlayers,
    values: solverValues,
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
        label: `No eligible player available for ${assignment.slotType}`,
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
        label: `Currently started player ${playerId} is unavailable`,
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
