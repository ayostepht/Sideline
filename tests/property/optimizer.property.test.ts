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

  /**
   * T6.10 (LINEUP-2, LINEUP-6): generalizes the hand-picked "3-way tied WR/FLEX" regression in
   * `recommend.test.ts` (T6.8's fix for Steph's reported bug) into a property.
   *
   * IMPORTANT, and why this is NOT simply "feed `result.optimalAssignment` straight back in as
   * the next `currentAssignment` and assert no swaps": that construction is a mathematical
   * tautology, true whether or not the stability bonus exists, so it would never have caught the
   * T6.8 bug. Proof sketch: `solveOptimalAssignment`'s *chosen player multiset and raw value* for
   * a given (slots, players, values) triple is already fully determined before the stability
   * bonus is even considered (the bonus only breaks ties among equally-valued permutations of
   * that same multiset). `recommendLineup`'s lock bookkeeping is also unaffected, because a locked
   * slot's pinned starter in `optimalAssignment` is always literally the *same* player id that was
   * locked in the original `currentAssignment` that produced it. So handing `optimalAssignment`'s
   * player ids straight back in as the next call's `currentAssignment` reproduces an input the
   * solver is already guaranteed to map to itself, with or without the bonus - confirmed
   * empirically: with `STABILITY_BONUS_EPSILON`'s addition commented out in a local, reverted-
   * before-reporting edit of `solve.ts`, this naive construction still passed all 1000 runs (see
   * the Task Report).
   *
   * The actual bug needs a *different* permutation of the same optimal player multiset as the
   * "current" lineup - exactly what "three WR-eligible players tied... across two WR slots and a
   * FLEX slot" produces in the hand-picked regression (swapping any two of those three players
   * never changes the total, since total value is a sum over the chosen multiset, independent of
   * which slot each member sits in). This property builds that directly and generally: take a real
   * optimal lineup, find any two of its *unlocked* filled slots whose players are mutually
   * eligible for each other's slot (a legal, same-multiset, same-total-value swap), and swap them.
   * Crucially this requires no value tie at all, only slot-eligibility overlap between two players
   * that both happen to be optimal - a strictly more general trigger than the hand-picked example's
   * equal-value setup. Feeding that swapped (but equally optimal) lineup back in as "today's
   * current" must never produce a swap back to some other, differently-tie-broken permutation:
   * that would be exactly T6.8's "chain of swaps that nets to zero benefit" bug.
   */
  // Explicit timeout (vitest default is 5000ms): this property calls recommendLineup twice per
  // run (vs. once for the invariant test above) plus an O(slots^2) swappable-pair search, so it
  // runs measurably heavier per iteration; under V8 coverage instrumentation (pnpm test:coverage,
  // U2a) that pushed it over the default timeout even though the uninstrumented run finishes in
  // well under 1s. Matches this config's existing convention for CPU-heavy test categories
  // (vitest.config.ts's integration/contract projects, testTimeout: 30_000).
  it("LINEUP-6: an already-optimal lineup is a stable fixed point, even swapped among interchangeable slots", () => {
    fc.assert(
      fc.property(fc.gen(), (g) => {
        const testCase = genCase(g);
        const { slots, warnings, players, currentAssignment } = testCase;

        const firstResult = recommendLineup({
          slots,
          slotWarnings: warnings,
          players,
          currentAssignment,
          now: NOW,
        });

        // Find two distinct, unlocked, filled slots in the optimal lineup whose incumbents are
        // mutually eligible for each other's slot, so exchanging them is a legal alternative
        // optimal lineup (same multiset, same total value, different arrangement). Locked slots
        // are excluded: they are pinned by a different invariant (LINEUP-3, checked elsewhere),
        // not the stability bonus this test targets.
        const unlockedFilled: { slotIndex: number; playerId: string }[] = [];
        firstResult.optimalAssignment.forEach((assignment, i) => {
          if (assignment.playerId === null) return;
          const p = players.find((pl) => pl.playerId === assignment.playerId);
          if (p === undefined) return;
          const locked = isLocked(
            { kickoffUtc: p.kickoffUtc, kickoffApproximate: p.kickoffApproximate },
            NOW,
          );
          if (!locked) unlockedFilled.push({ slotIndex: i, playerId: assignment.playerId });
        });

        let swapPair: [number, number] | undefined;
        outer: for (let a = 0; a < unlockedFilled.length; a++) {
          for (let b = a + 1; b < unlockedFilled.length; b++) {
            const entryA = unlockedFilled[a];
            const entryB = unlockedFilled[b];
            if (entryA === undefined || entryB === undefined) continue;
            const playerA = players.find((pl) => pl.playerId === entryA.playerId);
            const playerB = players.find((pl) => pl.playerId === entryB.playerId);
            if (playerA === undefined || playerB === undefined) continue;
            const slotA = slots[entryA.slotIndex];
            const slotB = slots[entryB.slotIndex];
            if (slotA === undefined || slotB === undefined) continue;
            const crossEligible =
              isPlayerEligibleForSlot(playerA.fantasyPositions, slotB.eligiblePositions) &&
              isPlayerEligibleForSlot(playerB.fantasyPositions, slotA.eligiblePositions);
            if (crossEligible) {
              swapPair = [entryA.slotIndex, entryB.slotIndex];
              break outer;
            }
          }
        }
        // No such pair exists for this randomly generated case (e.g. too few filled slots, or no
        // eligibility overlap) - nothing to assert, discard the run rather than passing vacuously.
        fc.pre(swapPair !== undefined);
        const [slotIndexA, slotIndexB] = swapPair;

        const secondCurrentAssignment = firstResult.optimalAssignment.map(
          (assignment) => assignment.playerId,
        );
        const playerAtA = secondCurrentAssignment[slotIndexA];
        const playerAtB = secondCurrentAssignment[slotIndexB];
        secondCurrentAssignment[slotIndexA] = playerAtB ?? null;
        secondCurrentAssignment[slotIndexB] = playerAtA ?? null;

        const secondResult = recommendLineup({
          slots,
          slotWarnings: warnings,
          players,
          currentAssignment: secondCurrentAssignment,
          now: NOW,
        });

        expect(secondResult.swaps).toEqual([]);
        expect(Math.abs(secondResult.pointDelta)).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 30_000);
});
