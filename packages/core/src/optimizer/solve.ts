/**
 * LINEUP-2 (PLAN 5.4): exact maximum-weight bipartite assignment between starting lineup slots
 * and eligible rostered players, solved with the Hungarian (Kuhn-Munkres) algorithm so the
 * result is provably optimal, not a greedy approximation.
 *
 * Locks, availability multipliers, lineup modes, and the final reasons/issues output are a later
 * module (T3.4b); this module only solves the generic assignment problem it is handed. Input
 * player "value" is a plain `{ playerId: string }` to number map supplied by the caller (never
 * computed here), so the solver is fully generic over whatever values a caller wants to optimize.
 *
 * ## Formulation
 * Slots are rows, players are columns. An (slot, player) pair is a valid edge only when
 * {@link isPlayerEligibleForSlot} holds; ineligible pairs are given a large negative weight so
 * they are never chosen while any alternative (including leaving the slot or the player unused)
 * exists. To let a slot legitimately go unfilled (no eligible player available) and a player
 * legitimately go unused (the normal case, far more rostered players than slots), the weight
 * matrix is padded to a square `(numSlots + numPlayers) x (numSlots + numPlayers)` matrix:
 * - `numSlots` extra "empty" columns, one potential per real slot, weight 0: lets any slot end up
 *   unassigned without being forced onto an ineligible player.
 * - `numPlayers` extra "unused" rows, one potential per real player, weight 0: lets any player end
 *   up unassigned without preventing a complete solve.
 *
 * Maximizing total weight is run as the classic minimum-cost assignment problem on
 * `cost = -weight`. Ties (two eligible players with exactly equal value for a slot) are broken
 * deterministically in favor of the lower `playerId`, via an epsilon many orders of magnitude
 * smaller than any realistic point value (so it can never change which *value* is optimal, only
 * which equally-valued assignment is reported).
 *
 * The epsilon is a **bonus** (added) for a strictly positive value, so a genuinely useful player
 * is still always preferred over leaving the slot empty (weight 0), unchanged. For a
 * non-positive value (`<= 0` - the realistic case being LINEUP-4's zeroed-out Out/IR/Suspended/bye
 * players, and defensively any other caller-supplied non-positive value), the epsilon is instead a
 * **penalty** (subtracted), making that edge strictly *worse* than leaving the slot empty. Without
 * this sign flip, `0 + epsilon > 0` would make the solver always prefer filling a slot with a
 * worthless player over leaving it empty whenever no better option exists - silently recommending
 * a player the system has itself determined is unavailable. The epsilon is excluded from the
 * reported `totalValue`, which is always the exact sum of real player values.
 *
 * ## Solution stability (optional `currentAssignment`)
 * Because the `playerId`-ascending tiebreak above only orders *individual* (slot, player) edges,
 * it does nothing to prevent a different-but-equal-*total*-value permutation from being chosen
 * when several interchangeable players (e.g. three WR-eligible players tied in value across two
 * WR slots and a FLEX slot that all accept WR) can be arranged multiple equally-optimal ways. A
 * caller that diffs the result against a real current lineup (see `recommend.ts`) would then
 * report a chain of "swaps" that nets to exactly zero benefit - confusing and not a real
 * recommendation.
 *
 * `AssignmentInput.currentAssignment`, when supplied, gives each slot's current incumbent player
 * id (or `null`), parallel to `slots` by index. When a (slot, player) edge's player is that slot's
 * incumbent, it receives `STABILITY_BONUS_EPSILON` - strictly larger than the largest possible
 * `playerId` tiebreak (`numPlayers * TIEBREAK_EPSILON`, comfortably true for any realistic roster
 * or player-pool size) so it is the *primary* tiebreak whenever both apply, but still many orders
 * of magnitude smaller than any realistic point value, so (exactly like `TIEBREAK_EPSILON`) it can
 * never change which *value* is optimal, only which equally-valued assignment is reported. The
 * same positive/non-positive sign-flip logic as the main tiebreak applies, so a stability bonus
 * never makes the solver prefer keeping a zero/negative-value incumbent over leaving the slot
 * empty or picking a genuinely positive-value alternative.
 *
 * This parameter is optional and additive: every existing call site (e.g. `waiver/lineup-impact.ts`,
 * which has no notion of a "current" lineup) simply never passes it, and omitting it leaves
 * behavior byte-for-byte identical to before this parameter existed.
 */
import { isPlayerEligibleForSlot, type SlotSpec } from "./eligibility.js";

export interface AssignmentPlayer {
  playerId: string;
  fantasyPositions: readonly string[];
}

export interface AssignmentInput {
  slots: readonly SlotSpec[];
  players: readonly AssignmentPlayer[];
  /** Player value under the caller's selected mode. A player with no entry is treated as 0. */
  values: Readonly<Record<string, number>>;
  /**
   * Optional solution-stability hint: slot `i`'s current incumbent player id, or `null` for no
   * incumbent, parallel to `slots` by index. See the module doc's "Solution stability" paragraph.
   * Omitted (the default) leaves behavior unchanged from before this parameter existed.
   */
  currentAssignment?: ReadonlyArray<string | null>;
}

export interface SlotAssignment {
  slotType: string;
  playerId: string | null;
}

export interface AssignmentResult {
  assignments: readonly SlotAssignment[];
  totalValue: number;
}

/** Tie-break bonus magnitude; far smaller than any realistic fantasy point difference. */
const TIEBREAK_EPSILON = 1e-9;

/**
 * Current-incumbent stability bonus magnitude (see the module doc's "Solution stability"
 * paragraph). Must stay strictly larger than the largest possible `playerId` tiebreak,
 * `numPlayers * TIEBREAK_EPSILON`, so it is the primary tiebreak whenever both apply; true here
 * with ~14 orders of magnitude of headroom for any realistic roster or player-pool size (well
 * under 1e5 players). Still ~5-6 orders of magnitude smaller than any realistic point value.
 */
const STABILITY_BONUS_EPSILON = 1e-4;

/**
 * Reads `arr[index]`, asserting the index is in bounds. `noUncheckedIndexedAccess` types every
 * array read as possibly `undefined`; every call site here indexes within a loop bound derived
 * from the same array's length (or a freshly allocated array of a known size), so the index is
 * always valid and the thrown branch is unreachable in practice. Throwing (rather than a
 * non-null assertion, which the repo's lint rules forbid) keeps that invariant checked instead of
 * silently trusted.
 */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  }
  return value;
}

/**
 * LINEUP-2: exact maximum-weight bipartite assignment of `slots` (by index; duplicate slot types
 * are independent) to `players`, honoring eligibility and each slot/player's capacity of one.
 * Works for any slots/players/values the caller supplies (LINEUP-9: no team is hardcoded).
 */
export function solveOptimalAssignment(input: AssignmentInput): AssignmentResult {
  const { slots, players, values, currentAssignment } = input;
  const numSlots = slots.length;
  const numPlayers = players.length;

  if (numSlots === 0) {
    return { assignments: [], totalValue: 0 };
  }

  const rawValues: number[] = players.map((player) => values[player.playerId] ?? 0);

  // Deterministic tie-break ranking: lower playerId (ascending) gets a larger epsilon bonus.
  const rankByPlayerId = new Map<string, number>();
  players
    .map((player) => player.playerId)
    .slice()
    .sort()
    .forEach((playerId, rank) => rankByPlayerId.set(playerId, rank));

  const sumAbsValues = rawValues.reduce((sum, value) => sum + Math.abs(value), 0);
  // Comfortably worse than any achievable combination of real + dummy edges, so an ineligible
  // pair is never chosen while any legitimate (eligible or dummy) alternative exists.
  const sentinel = -(sumAbsValues + numPlayers + 1) * 1000;

  // Square matrix: numSlots real slot rows + numPlayers dummy "unused player" rows,
  // numPlayers real player columns + numSlots dummy "empty slot" columns.
  const n = numSlots + numPlayers;
  const weight: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0);
    if (i < numSlots) {
      const slot = at(slots, i);
      const incumbentPlayerId = currentAssignment?.[i] ?? null;
      for (let j = 0; j < numPlayers; j++) {
        const player = at(players, j);
        if (isPlayerEligibleForSlot(player.fantasyPositions, slot.eligiblePositions)) {
          const rank = rankByPlayerId.get(player.playerId) ?? 0;
          const tiebreak = (numPlayers - rank) * TIEBREAK_EPSILON;
          const stabilityBonus =
            incumbentPlayerId !== null && player.playerId === incumbentPlayerId
              ? STABILITY_BONUS_EPSILON
              : 0;
          const epsilon = tiebreak + stabilityBonus;
          const rawValue = at(rawValues, j);
          // Bonus for a genuinely useful (positive) value; penalty for non-positive, so a
          // worthless/unavailable player never beats leaving the slot empty (weight 0), and a
          // stability bonus never keeps a zero/negative-value incumbent over a better option. See
          // the module doc's tiebreak and "Solution stability" paragraphs.
          row[j] = rawValue > 0 ? rawValue + epsilon : rawValue - epsilon;
        } else {
          row[j] = sentinel;
        }
      }
      // Columns [numPlayers, n) are this slot's "leave empty" dummy options: weight stays 0.
    }
    // Dummy rows (i >= numSlots, representing "no slot") stay weight 0 for every column.
    weight.push(row);
  }

  const cost: number[][] = weight.map((row) => row.map((w) => -w));
  const { assignment } = hungarianMinimize(cost);

  const assignments: SlotAssignment[] = [];
  let totalValue = 0;
  for (let i = 0; i < numSlots; i++) {
    const col = at(assignment, i);
    const slotType = at(slots, i).slotType;
    if (col < numPlayers) {
      const player = at(players, col);
      assignments.push({ slotType, playerId: player.playerId });
      totalValue += at(rawValues, col);
    } else {
      assignments.push({ slotType, playerId: null });
    }
  }

  return { assignments, totalValue };
}

/**
 * Kuhn-Munkres (Hungarian) algorithm for the square minimum-cost assignment problem, O(n^3).
 * `cost` must be an `n x n` matrix. Returns `assignment[row] = col` (both 0-indexed). Internals
 * follow the classic 1-indexed formulation (shortest augmenting path with row/column potentials),
 * using arrays sized `n + 1` so index 0 can serve as the algorithm's scratch slot.
 */
function hungarianMinimize(cost: readonly (readonly number[])[]): {
  assignment: number[];
  totalCost: number;
} {
  const n = cost.length;
  if (n === 0) {
    return { assignment: [], totalCost: 0 };
  }

  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  // p[j] = row (1-indexed) currently matched to column j; p[0] is a scratch slot used while
  // searching for an augmenting path for the row being processed.
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = at(p, j0);
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!at(used, j)) {
          const cur = at(at(cost, i0 - 1), j - 1) - at(u, i0) - at(v, j);
          if (cur < at(minv, j)) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (at(minv, j) < delta) {
            delta = at(minv, j);
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (at(used, j)) {
          const row = at(p, j);
          u[row] = at(u, row) + delta;
          v[j] = at(v, j) - delta;
        } else {
          minv[j] = at(minv, j) - delta;
        }
      }
      j0 = j1;
    } while (at(p, j0) !== 0);
    do {
      const j1 = at(way, j0);
      p[j0] = at(p, j1);
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    assignment[at(p, j) - 1] = j - 1;
  }
  let totalCost = 0;
  for (let i = 0; i < n; i++) {
    totalCost += at(at(cost, i), at(assignment, i));
  }
  return { assignment, totalCost };
}
