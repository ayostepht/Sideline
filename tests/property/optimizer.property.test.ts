/**
 * T3.6: property-based tests for the lineup optimizer (LINEUP-1..LINEUP-9, PLAN 5.4 / 10.5),
 * checking invariants hold over many randomly generated inputs rather than a few hand-picked ones.
 * Black-box against packages/core's public exports; no modification to optimizer internals.
 *
 * Uses `fc.gen()` (fast-check 4) to build interdependent random structures imperatively: a random
 * `roster_positions`-shaped array, a random player pool whose size and fields depend on nothing
 * upstream, and a random `currentAssignment` that depends on both the resolved slots and the
 * player pool (so it can respect eligibility).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyAvailability,
  isLocked,
  isPlayerEligibleForSlot,
  recommendLineup,
  resolveSlots,
  SLOT_ELIGIBILITY,
  type RecommendLineupPlayer,
} from "../../packages/core/src/index.js";

const NOW = new Date("2026-09-14T18:00:00.000Z");
const NUM_RUNS = 1000;
const EPS = 1e-6;

/** Every roster_positions entry fast-check may draw: real slot types plus reserve types. */
const ROSTER_POSITION_TYPES = [...Object.keys(SLOT_ELIGIBILITY), "BN", "IR", "TAXI"];

/** Every distinct fantasy position that appears in any SLOT_ELIGIBILITY entry. */
const FANTASY_POSITIONS = [
  ...new Set(Object.values(SLOT_ELIGIBILITY).flatMap((positions) => [...positions])),
];

const STATUSES: readonly (string | null)[] = [
  null,
  "Out",
  "IR",
  "Suspended",
  "Doubtful",
  "Questionable",
];
/**
 * A zero-arg builder wrapping `fc.constantFrom(...STATUSES)`. `g(fc.constantFrom, ...STATUSES)`
 * fails to infer `T` cleanly (STATUSES spreads into a variable-length array, not a fixed tuple,
 * which `GeneratorValueFunction`'s `TArgs extends unknown[]` can't match precisely), so `status`
 * silently typed as `any`. Wrapping with zero arguments sidesteps the inference entirely.
 */
const statusArbitrary = (): fc.Arbitrary<string | null> => fc.constantFrom(...STATUSES);

/** A kickoff strictly before or strictly after NOW, so lock state is unambiguous (never equal). */
function genKickoff(g: fc.GeneratorValue, locked: boolean): string {
  const offsetMs = g(fc.integer, { min: 1, max: 1_000_000_000 });
  const timestamp = locked ? NOW.getTime() - offsetMs : NOW.getTime() + offsetMs;
  return new Date(timestamp).toISOString();
}

interface GeneratedCase {
  slots: ReturnType<typeof resolveSlots>["slots"];
  warnings: ReturnType<typeof resolveSlots>["warnings"];
  players: RecommendLineupPlayer[];
  currentAssignment: (string | null)[];
}

/**
 * Builds one random-but-realistic optimizer input: a roster shape, a player pool, and a current
 * lineup that only ever places eligible players (some locked, some not).
 */
function genCase(g: fc.GeneratorValue): GeneratedCase {
  const rosterPositions = g(fc.array, fc.constantFrom(...ROSTER_POSITION_TYPES), {
    minLength: 1,
    maxLength: 10,
  });
  const { slots, warnings } = resolveSlots(rosterPositions);

  const numPlayers = g(fc.integer, { min: 1, max: 12 });
  const players: RecommendLineupPlayer[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const fantasyPositions = g(fc.uniqueArray, fc.constantFrom(...FANTASY_POSITIONS), {
      minLength: 1,
      maxLength: 3,
    }) as string[];
    const rawValue = g(fc.double, { min: 0, max: 50, noNaN: true, noDefaultInfinity: true });
    const status = g(statusArbitrary);
    const isBye = g(fc.boolean);
    const locked = g(fc.boolean);
    players.push({
      playerId: `P${i}`,
      fantasyPositions,
      rawValue,
      status,
      isBye,
      kickoffUtc: genKickoff(g, locked),
      kickoffApproximate: g(fc.boolean),
    });
  }

  // Current lineup: for each slot, maybe place a random still-unused eligible player.
  const used = new Set<string>();
  const currentAssignment: (string | null)[] = slots.map((slotSpec) => {
    const eligible = players.filter(
      (p) =>
        !used.has(p.playerId) &&
        isPlayerEligibleForSlot(p.fantasyPositions, slotSpec.eligiblePositions),
    );
    const place = g(fc.boolean);
    if (!place || eligible.length === 0) return null;
    const idx = g(fc.integer, { min: 0, max: eligible.length - 1 });
    const chosenId = eligible[idx]?.playerId ?? null;
    if (chosenId !== null) used.add(chosenId);
    return chosenId;
  });

  return { slots, warnings, players, currentAssignment };
}

/**
 * Builds one additional, independently-random *valid* lineup for invariant (d): honors slot
 * eligibility and no-duplicate-player, AND (so the comparison is a fair apples-to-apples "legal
 * alternative", matching exactly what recommendLineup itself is allowed to choose from) respects
 * the same lock constraints recommendLineup applies: a locked slot's current starter is pinned,
 * and a locked non-starter can never be placed anywhere. Without honoring locks here, this
 * generator could build a lineup that recommendLineup is not permitted to produce (e.g. moving in
 * a locked bench player), which would make "optimal >= this" false for a reason that has nothing
 * to do with a bug in the optimizer. See LINEUP-3.
 */
function genAlternativeLineup(g: fc.GeneratorValue, testCase: GeneratedCase): (string | null)[] {
  const { slots, players, currentAssignment } = testCase;

  const startingIds = new Set(currentAssignment.filter((id): id is string => id !== null));
  const lockedSlotIndexes = new Set<number>();
  currentAssignment.forEach((id, i) => {
    if (id === null) return;
    const p = players.find((pl) => pl.playerId === id);
    if (
      p !== undefined &&
      isLocked({ kickoffUtc: p.kickoffUtc, kickoffApproximate: p.kickoffApproximate }, NOW)
    ) {
      lockedSlotIndexes.add(i);
    }
  });
  const lockedBenchIds = new Set(
    players
      .filter(
        (p) =>
          isLocked({ kickoffUtc: p.kickoffUtc, kickoffApproximate: p.kickoffApproximate }, NOW) &&
          !startingIds.has(p.playerId),
      )
      .map((p) => p.playerId),
  );

  // Seed `used` with every locked slot's pinned player id *before* assigning any non-locked
  // slot. Locked slots are pinned regardless of array order below, but a naive single-pass
  // `.map()` that only adds a pinned id to `used` when the map reaches that slot's own index
  // lets an earlier non-locked slot pick the same (still-starting, not-yet-"used") player id
  // first, duplicating it across two slots. Seeding up front closes that window.
  const used = new Set<string>();
  lockedSlotIndexes.forEach((i) => {
    const pinned = currentAssignment[i];
    if (pinned !== null && pinned !== undefined) used.add(pinned);
  });

  return slots.map((slotSpec, i) => {
    if (lockedSlotIndexes.has(i)) {
      return currentAssignment[i] ?? null;
    }
    const eligible = players.filter(
      (p) =>
        !used.has(p.playerId) &&
        !lockedBenchIds.has(p.playerId) &&
        isPlayerEligibleForSlot(p.fantasyPositions, slotSpec.eligiblePositions),
    );
    const place = g(fc.boolean);
    if (!place || eligible.length === 0) return null;
    const idx = g(fc.integer, { min: 0, max: eligible.length - 1 });
    const chosenId = eligible[idx]?.playerId ?? null;
    if (chosenId !== null) used.add(chosenId);
    return chosenId;
  });
}

/** The adjusted value recommendLineup would use internally for one player id, or 0 for null. */
function adjustedValueOf(
  playerId: string | null,
  players: readonly RecommendLineupPlayer[],
): number {
  if (playerId === null) return 0;
  const p = players.find((pl) => pl.playerId === playerId);
  if (p === undefined) return 0;
  return applyAvailability({ status: p.status, isBye: p.isBye, rawValue: p.rawValue }).value;
}

describe("optimizer property tests (T3.6)", () => {
  it("LINEUP-2/LINEUP-3/LINEUP-6: valid, lock-respecting, non-regressive, globally optimal lineups", () => {
    fc.assert(
      fc.property(fc.gen(), (g) => {
        const testCase = genCase(g);
        const { slots, warnings, players, currentAssignment } = testCase;

        const result = recommendLineup({
          slots,
          slotWarnings: warnings,
          players,
          currentAssignment,
          now: NOW,
        });

        // (a) Valid lineup: every assigned player is eligible for their slot, and no player id
        // is assigned to more than one slot.
        const assignedIds: string[] = [];
        result.optimalAssignment.forEach((assignment, i) => {
          if (assignment.playerId === null) return;
          const p = players.find((pl) => pl.playerId === assignment.playerId);
          expect(p).toBeDefined();
          const slotSpec = slots[i];
          expect(slotSpec).toBeDefined();
          if (p !== undefined && slotSpec !== undefined) {
            expect(isPlayerEligibleForSlot(p.fantasyPositions, slotSpec.eligiblePositions)).toBe(
              true,
            );
          }
          assignedIds.push(assignment.playerId);
        });
        expect(new Set(assignedIds).size).toBe(assignedIds.length);

        // (b) Locked players never move: a slot whose current starter is locked keeps that
        // starter in the optimal assignment.
        currentAssignment.forEach((currentId, i) => {
          if (currentId === null) return;
          const p = players.find((pl) => pl.playerId === currentId);
          if (p === undefined) return;
          const locked = isLocked(
            { kickoffUtc: p.kickoffUtc, kickoffApproximate: p.kickoffApproximate },
            NOW,
          );
          if (locked) {
            expect(result.optimalAssignment[i]?.playerId).toBe(currentId);
          }
        });

        // (c) Optimal is at least as good as current: the recommendation can never make the
        // lineup worse.
        expect(result.pointDelta).toBeGreaterThanOrEqual(-EPS);

        // (d) Optimal is at least as good as any other lock-respecting valid lineup.
        const alternative = genAlternativeLineup(g, testCase);
        const alternativeTotal = alternative.reduce(
          (sum, id) => sum + adjustedValueOf(id, players),
          0,
        );
        const optimalTotal = result.optimalAssignment.reduce(
          (sum, assignment) => sum + adjustedValueOf(assignment.playerId, players),
          0,
        );
        expect(optimalTotal).toBeGreaterThanOrEqual(alternativeTotal - EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
