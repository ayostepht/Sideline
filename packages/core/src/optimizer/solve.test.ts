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

  it("missing value entries are treated as 0", () => {
    const slots = [slot("QB", ["QB"])];
    const players = [player("QB1", ["QB"])];
    const result = solveOptimalAssignment({ slots, players, values: {} });
    expect(result.assignments).toEqual([{ slotType: "QB", playerId: "QB1" }]);
    expect(result.totalValue).toBe(0);
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
