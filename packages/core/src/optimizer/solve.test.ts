import { describe, expect, it } from "vitest";
import type { SlotSpec } from "./eligibility.js";
import { solveOptimalAssignment, type AssignmentPlayer } from "./solve.js";

const slot = (slotType: string, eligiblePositions: readonly string[]): SlotSpec => ({
  slotType,
  eligiblePositions,
});

const player = (playerId: string, fantasyPositions: readonly string[]): AssignmentPlayer => ({
  playerId,
  fantasyPositions,
});

describe("solveOptimalAssignment (LINEUP-2)", () => {
  it("hand-computed: 2 slots, 3 players, picks the obviously optimal pairing", () => {
    // QB slot can only take QB1 (25). FLEX (RB/WR/TE) can take RB1 (15) or WR1 (18); 18 > 15, so
    // FLEX takes WR1. Optimal total = 25 + 18 = 43.
    const slots = [slot("QB", ["QB"]), slot("FLEX", ["RB", "WR", "TE"])];
    const players = [player("QB1", ["QB"]), player("RB1", ["RB"]), player("WR1", ["WR"])];
    const values = { QB1: 25, RB1: 15, WR1: 18 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([
      { slotType: "QB", playerId: "QB1" },
      { slotType: "FLEX", playerId: "WR1" },
    ]);
    expect(result.totalValue).toBeCloseTo(43, 6);
  });

  it("exact solve beats a naive greedy fill-FLEX-first approach", () => {
    // Players: A (WR only, 20) is the single best player overall; B (RB only, 10); C (WR only, 8).
    // A greedy approach that fills FLEX first with the overall best player would put A in FLEX
    // (20), leaving only C (8) for WR: total 28. The exact optimum instead reserves A for WR and
    // puts B (10, the best remaining FLEX-eligible player) in FLEX: total 30 > 28.
    const slots = [slot("FLEX", ["RB", "WR", "TE"]), slot("WR", ["WR"])];
    const players = [player("A", ["WR"]), player("B", ["RB"]), player("C", ["WR"])];
    const values = { A: 20, B: 10, C: 8 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.totalValue).toBeCloseTo(30, 6);
    expect(result.assignments).toEqual([
      { slotType: "FLEX", playerId: "B" },
      { slotType: "WR", playerId: "A" },
    ]);
  });

  it("leaves a slot with zero eligible players null and still solves the rest", () => {
    const slots = [slot("DEF", ["DEF"]), slot("QB", ["QB"])];
    const players = [player("QB1", ["QB"])];
    const values = { QB1: 10 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([
      { slotType: "DEF", playerId: null },
      { slotType: "QB", playerId: "QB1" },
    ]);
    expect(result.totalValue).toBeCloseTo(10, 6);
  });

  it("more players than slots: most players are left unassigned (the normal case)", () => {
    const slots = [slot("QB", ["QB"])];
    const players = [player("QB1", ["QB"]), player("QB2", ["QB"]), player("QB3", ["QB"])];
    const values = { QB1: 10, QB2: 25, QB3: 15 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([{ slotType: "QB", playerId: "QB2" }]);
    expect(result.totalValue).toBeCloseTo(25, 6);
  });

  it("fewer eligible players than slots: leaves some slots null", () => {
    const slots = [slot("WR", ["WR"]), slot("WR", ["WR"])];
    const players = [player("WR1", ["WR"])];
    const values = { WR1: 12 };

    const result = solveOptimalAssignment({ slots, players, values });

    // Exactly one of the two WR slots gets the single eligible player; the other is null.
    const assignedSlots = result.assignments.filter((a) => a.playerId !== null);
    const nullSlots = result.assignments.filter((a) => a.playerId === null);
    expect(assignedSlots).toHaveLength(1);
    expect(assignedSlots[0]).toMatchObject({ playerId: "WR1" });
    expect(nullSlots).toHaveLength(1);
    expect(result.totalValue).toBeCloseTo(12, 6);
  });

  it("missing value entries are treated as 0, which is non-positive and loses to leaving the slot empty", () => {
    // A missing value entry resolves to the same raw value (0) as a LINEUP-4-zeroed unavailable
    // player: it must not be preferred over the "leave this slot empty" dummy option (see the
    // bug-fix tests below), so with a single eligible player worth 0 and no alternative, the
    // slot legitimately resolves to null.
    const slots = [slot("QB", ["QB"])];
    const players = [player("QB1", ["QB"])];
    const result = solveOptimalAssignment({ slots, players, values: {} });
    expect(result.assignments).toEqual([{ slotType: "QB", playerId: null }]);
    expect(result.totalValue).toBe(0);
  });

  it("a slot whose only eligible player has value 0 resolves to an empty slot, not that player (bug fix)", () => {
    // Reproduces the unavailable-player scenario: recommend.ts passes an adjusted value of exactly
    // 0 for Out/IR/Suspended/bye players. The solver must prefer leaving the slot empty (weight 0)
    // over assigning a 0-value player, since 0 is not a genuine improvement over nothing.
    const slots = [slot("RB", ["RB"])];
    const players = [player("RB1", ["RB"])];
    const values = { RB1: 0 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([{ slotType: "RB", playerId: null }]);
    expect(result.totalValue).toBe(0);
  });

  it("a slot with one positive-value and one 0-value eligible player picks the positive one (bug fix, unaffected case)", () => {
    const slots = [slot("RB", ["RB"])];
    const players = [player("RB1", ["RB"]), player("RB2", ["RB"])];
    const values = { RB1: 0, RB2: 7 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([{ slotType: "RB", playerId: "RB2" }]);
    expect(result.totalValue).toBeCloseTo(7, 6);
  });

  it("empty slots produce an empty result", () => {
    const result = solveOptimalAssignment({
      slots: [],
      players: [player("QB1", ["QB"])],
      values: { QB1: 10 },
    });
    expect(result).toEqual({ assignments: [], totalValue: 0 });
  });

  it("empty players: every slot resolves to null", () => {
    const slots = [slot("QB", ["QB"]), slot("WR", ["WR"])];
    const result = solveOptimalAssignment({ slots, players: [], values: {} });
    expect(result.assignments).toEqual([
      { slotType: "QB", playerId: null },
      { slotType: "WR", playerId: null },
    ]);
    expect(result.totalValue).toBe(0);
  });

  it("breaks ties deterministically by playerId ascending", () => {
    // Two WR-eligible players tied at the same value for a single WR slot; the solver must
    // consistently prefer the lower playerId.
    const slots = [slot("WR", ["WR"])];
    const players = [player("Z1", ["WR"]), player("A1", ["WR"])];
    const values = { Z1: 10, A1: 10 };

    const result = solveOptimalAssignment({ slots, players, values });

    expect(result.assignments).toEqual([{ slotType: "WR", playerId: "A1" }]);
    expect(result.totalValue).toBeCloseTo(10, 6);
  });

  describe("currentAssignment stability bonus (T6.8)", () => {
    it("a 3-way tie across 2 WR slots + 1 FLEX slot resolves to the currentAssignment permutation", () => {
      // Reproduces Steph's bug report shape: 3 WR-eligible players, values arranged so two
      // different WR/WR/FLEX permutations are exactly tied at the same total (all three share the
      // same value, so every permutation of {A, B, C} across the 3 slots sums to the same total).
      // Without the stability bonus, the solver's only tiebreak (ascending playerId) would always
      // pick the same single permutation regardless of which one the user actually started -
      // here that means WR1->A, WR2->B, FLEX->C, which does NOT match `currentAssignment` below.
      const slots = [slot("WR", ["WR"]), slot("WR", ["WR"]), slot("FLEX", ["RB", "WR", "TE"])];
      const players = [player("A", ["WR"]), player("B", ["WR"]), player("C", ["WR"])];
      const values = { A: 10, B: 10, C: 10 };
      // User's actual current lineup: WR1 has C, WR2 has A, FLEX has B - deliberately not the
      // playerId-ascending permutation (WR1->A, WR2->B, FLEX->C) the solver would otherwise pick.
      const currentAssignment = ["C", "A", "B"];

      const result = solveOptimalAssignment({ slots, players, values, currentAssignment });

      expect(result.assignments).toEqual([
        { slotType: "WR", playerId: "C" },
        { slotType: "WR", playerId: "A" },
        { slotType: "FLEX", playerId: "B" },
      ]);
      expect(result.totalValue).toBeCloseTo(30, 6);
    });

    it("breaks ties deterministically by playerId ascending when currentAssignment is omitted (unchanged)", () => {
      // Same tie shape as above, but with no `currentAssignment`: must fall back to the existing
      // playerId-ascending tiebreak exactly as before this parameter existed.
      const slots = [slot("WR", ["WR"]), slot("WR", ["WR"]), slot("FLEX", ["RB", "WR", "TE"])];
      const players = [player("A", ["WR"]), player("B", ["WR"]), player("C", ["WR"])];
      const values = { A: 10, B: 10, C: 10 };

      const result = solveOptimalAssignment({ slots, players, values });

      expect(result.assignments).toEqual([
        { slotType: "WR", playerId: "A" },
        { slotType: "WR", playerId: "B" },
        { slotType: "FLEX", playerId: "C" },
      ]);
      expect(result.totalValue).toBeCloseTo(30, 6);
    });

    it("a genuinely better assignment always wins over the stability bonus", () => {
      // WR slot's incumbent (A, value 5) is strictly worse than the alternative (B, value 20): the
      // stability bonus (1e-4) is many orders of magnitude smaller than this 15-point gap, so the
      // solver must still pick B, not stay with the incumbent A.
      const slots = [slot("WR", ["WR"])];
      const players = [player("A", ["WR"]), player("B", ["WR"])];
      const values = { A: 5, B: 20 };
      const currentAssignment = ["A"];

      const result = solveOptimalAssignment({ slots, players, values, currentAssignment });

      expect(result.assignments).toEqual([{ slotType: "WR", playerId: "B" }]);
      expect(result.totalValue).toBeCloseTo(20, 6);
    });

    it("does not prefer a zero-value incumbent over leaving the slot empty (sign-flip applies to the bonus too)", () => {
      const slots = [slot("RB", ["RB"])];
      const players = [player("RB1", ["RB"])];
      const values = { RB1: 0 };
      const currentAssignment = ["RB1"];

      const result = solveOptimalAssignment({ slots, players, values, currentAssignment });

      expect(result.assignments).toEqual([{ slotType: "RB", playerId: null }]);
      expect(result.totalValue).toBe(0);
    });

    it("a null incumbent (slot currently empty) has no effect on the solve", () => {
      const slots = [slot("WR", ["WR"]), slot("WR", ["WR"])];
      const players = [player("A", ["WR"]), player("B", ["WR"])];
      const values = { A: 10, B: 10 };
      const currentAssignment = [null, null];

      const result = solveOptimalAssignment({ slots, players, values, currentAssignment });

      // No incumbent anywhere: falls back to the ordinary playerId-ascending tiebreak.
      expect(result.assignments).toEqual([
        { slotType: "WR", playerId: "A" },
        { slotType: "WR", playerId: "B" },
      ]);
    });
  });

  // LINEUP-9: the solver is generic over whatever slots/players/values it is handed - nothing
  // team-specific is hardcoded. Run it twice with two unrelated synthetic rosters/value maps in
  // the same test and confirm both solve correctly with nothing shared or cached between calls.
  it("is generic across independent rosters: two different solves in a row, each correct", () => {
    const rosterOneSlots = [slot("QB", ["QB"]), slot("WR", ["WR"])];
    const rosterOnePlayers = [player("QBX", ["QB"]), player("WRX", ["WR"])];
    const rosterOneValues = { QBX: 22, WRX: 14 };

    const rosterOneResult = solveOptimalAssignment({
      slots: rosterOneSlots,
      players: rosterOnePlayers,
      values: rosterOneValues,
    });
    expect(rosterOneResult.assignments).toEqual([
      { slotType: "QB", playerId: "QBX" },
      { slotType: "WR", playerId: "WRX" },
    ]);
    expect(rosterOneResult.totalValue).toBeCloseTo(36, 6);

    const rosterTwoSlots = [
      slot("RB", ["RB"]),
      slot("TE", ["TE"]),
      slot("SUPER_FLEX", ["QB", "RB", "WR", "TE"]),
    ];
    const rosterTwoPlayers = [player("RBY", ["RB"]), player("TEY", ["TE"]), player("QBY", ["QB"])];
    const rosterTwoValues = { RBY: 11, TEY: 9, QBY: 27 };

    const rosterTwoResult = solveOptimalAssignment({
      slots: rosterTwoSlots,
      players: rosterTwoPlayers,
      values: rosterTwoValues,
    });
    expect(rosterTwoResult.assignments).toEqual([
      { slotType: "RB", playerId: "RBY" },
      { slotType: "TE", playerId: "TEY" },
      { slotType: "SUPER_FLEX", playerId: "QBY" },
    ]);
    expect(rosterTwoResult.totalValue).toBeCloseTo(47, 6);

    // Re-running roster one again gives the exact same result (nothing cached/shared).
    const rosterOneRepeat = solveOptimalAssignment({
      slots: rosterOneSlots,
      players: rosterOnePlayers,
      values: rosterOneValues,
    });
    expect(rosterOneRepeat).toEqual(rosterOneResult);
  });

  it("does not mutate its inputs", () => {
    const slots = [slot("QB", ["QB"])];
    const players = [player("QB1", ["QB"])];
    const values = { QB1: 10 };
    solveOptimalAssignment({ slots, players, values });
    expect(slots).toEqual([{ slotType: "QB", eligiblePositions: ["QB"] }]);
    expect(players).toEqual([{ playerId: "QB1", fantasyPositions: ["QB"] }]);
    expect(values).toEqual({ QB1: 10 });
  });
});
