import { describe, expect, it } from "vitest";
import type { SlotSpec } from "./eligibility.js";
import { recommendLineup, type RecommendLineupPlayer } from "./recommend.js";

const slot = (slotType: string, eligiblePositions: readonly string[]): SlotSpec => ({
  slotType,
  eligiblePositions,
});

const player = (
  overrides: Partial<RecommendLineupPlayer> & { playerId: string },
): RecommendLineupPlayer => ({
  fantasyPositions: ["RB"],
  rawValue: 0,
  status: null,
  isBye: false,
  kickoffUtc: null,
  kickoffApproximate: false,
  ...overrides,
});

const NOW = new Date("2026-09-14T18:00:00.000Z");
const BEFORE_KICKOFF = "2026-09-14T20:00:00.000Z"; // after NOW: not locked
const AFTER_KICKOFF = "2026-09-14T17:00:00.000Z"; // before NOW: locked

describe("recommendLineup (LINEUP-3..LINEUP-6)", () => {
  it("keeps a locked starter in their slot even though a better bench option exists", () => {
    const slots = [slot("RB", ["RB"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 10,
        kickoffUtc: AFTER_KICKOFF,
      }),
      player({
        playerId: "RB2",
        fantasyPositions: ["RB"],
        rawValue: 20,
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1"],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "RB", playerId: "RB1" }]);
    expect(result.swaps).toEqual([]);
    expect(result.pointDelta).toBeCloseTo(0, 9);
    expect(result.playerReasons.RB1).toEqual([
      { code: "LOCKED", label: "Game has already started" },
    ]);
  });

  it("marks an approximate (fallback) lock distinctly from a confirmed one", () => {
    const slots = [slot("RB", ["RB"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 10,
        kickoffUtc: AFTER_KICKOFF,
        kickoffApproximate: true,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1"],
      now: NOW,
    });

    expect(result.playerReasons.RB1).toEqual([
      {
        code: "LOCKED",
        label: "Game has already started (kickoff time is estimated)",
        value: "approximate",
      },
    ]);
  });

  it("excludes a locked bench player from being newly assigned", () => {
    const slots = [slot("RB", ["RB"]), slot("FLEX", ["RB", "WR", "TE"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 5,
        kickoffUtc: BEFORE_KICKOFF,
      }),
      // RB2 is locked but is not a current starter anywhere: locked-and-benched, must not appear.
      player({
        playerId: "RB2",
        fantasyPositions: ["RB"],
        rawValue: 100,
        kickoffUtc: AFTER_KICKOFF,
      }),
      player({
        playerId: "WR1",
        fantasyPositions: ["WR"],
        rawValue: 8,
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1", null],
      now: NOW,
    });

    const assignedIds = result.optimalAssignment.map((a) => a.playerId);
    expect(assignedIds).not.toContain("RB2");
    expect(result.optimalAssignment).toEqual([
      { slotType: "RB", playerId: "RB1" },
      { slotType: "FLEX", playerId: "WR1" },
    ]);
  });

  it("produces a swap list reflecting a real improvement, with hand-verified pointDelta", () => {
    const slots = [slot("RB", ["RB"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 5,
        kickoffUtc: BEFORE_KICKOFF,
      }),
      player({
        playerId: "RB2",
        fantasyPositions: ["RB"],
        rawValue: 9,
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1"],
      now: NOW,
    });

    // Hand computation: optimal picks RB2 (9) over RB1 (5); current started RB1 (5).
    // pointDelta = 9 - 5 = 4.
    expect(result.optimalAssignment).toEqual([{ slotType: "RB", playerId: "RB2" }]);
    expect(result.swaps).toEqual([
      { slotIndex: 0, slotType: "RB", playerIdIn: "RB2", playerIdOut: "RB1" },
    ]);
    expect(result.pointDelta).toBeCloseTo(4, 9);
  });

  it("flags an empty slot after solving with an EMPTY_SLOT issue", () => {
    const slots = [slot("DEF", ["DEF"])];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players: [],
      currentAssignment: [null],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "DEF", playerId: null }]);
    expect(result.issues).toEqual([
      { code: "EMPTY_SLOT", label: "No one on your roster can fill DEF", value: "DEF" },
    ]);
  });

  it("never silently recommends the sole eligible player when they are unavailable (bug fix)", () => {
    // Bug report reproduction: one slot, one eligible player who is status "Out" (adjusted value
    // 0 after LINEUP-4 availability discounting), no current starter, no alternative. Before the
    // fix, the solver's tiebreak epsilon made a 0-value real player always beat the "leave empty"
    // dummy option, so this silently assigned RB1 with no warning. It must now resolve to an
    // empty slot and surface an EMPTY_SLOT issue.
    const slots = [slot("RB", ["RB"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 15,
        status: "Out",
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "RB", playerId: null }]);
    expect(result.issues).toContainEqual({
      code: "EMPTY_SLOT",
      label: "No one on your roster can fill RB",
      value: "RB",
    });
  });

  it("flags a currently-started Out player with an INACTIVE_STARTER issue", () => {
    const slots = [slot("RB", ["RB"])];
    const players = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 10,
        status: "Out",
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1"],
      now: NOW,
    });

    expect(result.issues).toContainEqual({
      code: "INACTIVE_STARTER",
      label: "Your current starter isn't available this week",
      value: "RB1",
    });
  });

  it("passes an unknown-slot-type warning through unchanged into issues", () => {
    const slotWarnings = [
      {
        code: "UNKNOWN_SLOT_TYPE",
        label: '"FOO" is a roster slot we don\'t recognize',
        value: "FOO",
      },
    ];
    const result = recommendLineup({
      slots: [],
      slotWarnings,
      players: [],
      currentAssignment: [],
      now: NOW,
    });

    expect(result.issues).toEqual(slotWarnings);
  });

  it("does not double-book a locked current starter into a second eligible slot (bug fix)", () => {
    // Bug report reproduction: two QB slots, one player QB1 who is a locked current starter in
    // slot 1, slot 0 has no other eligible candidate. QB1's fate is fully determined by slot 1
    // (LINEUP-3); they must not also be assignable into slot 0 by the solver. Before the fix,
    // `lockedAndBenchedIds` only excluded locked players who were NOT a current starter, so QB1
    // stayed in `solverPlayers` and got assigned to slot 0 too, duplicating them in the output.
    // Expected: slot 1 stays pinned to QB1, slot 0 resolves to null with an EMPTY_SLOT issue.
    const slots = [slot("QB", ["QB"]), slot("QB", ["QB"])];
    const players = [
      player({
        playerId: "QB1",
        fantasyPositions: ["QB"],
        rawValue: 20,
        kickoffUtc: AFTER_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null, "QB1"],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([
      { slotType: "QB", playerId: null },
      { slotType: "QB", playerId: "QB1" },
    ]);
    // The core invariant the property test checks: no player id appears in more than one slot.
    const assignedIds = result.optimalAssignment
      .map((a) => a.playerId)
      .filter((id): id is string => id !== null);
    expect(new Set(assignedIds).size).toBe(assignedIds.length);
    expect(result.issues).toContainEqual({
      code: "EMPTY_SLOT",
      label: "No one on your roster can fill QB",
      value: "QB",
    });
  });

  it("still solves normally for other slots when a locked starter is excluded from the pool", () => {
    // Same setup as above, but with a second, non-locked, eligible player of lower value than
    // the locked starter. The locked slot must stay pinned to QB1 (unaffected by the solver run),
    // and the other slot must now resolve to QB2, proving locked players are excluded from the
    // solver pool while everyone else still solves normally.
    const slots = [slot("QB", ["QB"]), slot("QB", ["QB"])];
    const players = [
      player({
        playerId: "QB1",
        fantasyPositions: ["QB"],
        rawValue: 20,
        kickoffUtc: AFTER_KICKOFF,
      }),
      player({
        playerId: "QB2",
        fantasyPositions: ["QB"],
        rawValue: 5,
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null, "QB1"],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([
      { slotType: "QB", playerId: "QB2" },
      { slotType: "QB", playerId: "QB1" },
    ]);
  });

  it("reports no swaps for a 3-way tied WR/FLEX lineup (T6.8 bug fix: Steph's reported scenario)", () => {
    // Reproduces the exact reported shape: 2 WR slots + 1 FLEX slot, 3 WR-eligible players tied
    // in value, already started in a particular arrangement. Before the stability fix, the
    // solver's only tiebreak (ascending playerId) could return a different-but-equal-value
    // permutation than the current lineup, producing a chain of "swaps" that netted to zero
    // benefit. Values are exactly tied, so any permutation is equally optimal; the fix means the
    // one matching today's actual lineup is reported, i.e. no swaps and zero point delta.
    const slots = [slot("WR", ["WR"]), slot("WR", ["WR"]), slot("FLEX", ["RB", "WR", "TE"])];
    const players = [
      player({
        playerId: "nico-collins",
        fantasyPositions: ["WR"],
        rawValue: 15,
        kickoffUtc: BEFORE_KICKOFF,
      }),
      player({
        playerId: "jameson-williams",
        fantasyPositions: ["WR"],
        rawValue: 15,
        kickoffUtc: BEFORE_KICKOFF,
      }),
      player({
        playerId: "dontayvion-wicks",
        fantasyPositions: ["WR"],
        rawValue: 15,
        kickoffUtc: BEFORE_KICKOFF,
      }),
    ];
    // Today's actual lineup, deliberately not the playerId-ascending order the solver would
    // otherwise default to.
    const currentAssignment = ["dontayvion-wicks", "nico-collins", "jameson-williams"];

    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment,
      now: NOW,
    });

    expect(result.swaps).toEqual([]);
    expect(result.pointDelta).toBeCloseTo(0, 9);
    expect(result.optimalAssignment).toEqual([
      { slotType: "WR", playerId: "dontayvion-wicks" },
      { slotType: "WR", playerId: "nico-collins" },
      { slotType: "FLEX", playerId: "jameson-williams" },
    ]);
  });

  it("echoes the current assignment normalized and parallel to slots", () => {
    const slots = [slot("RB", ["RB"]), slot("WR", ["WR"])];
    const players = [player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 5 })];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1", null],
      now: NOW,
    });

    expect(result.currentAssignment).toEqual([
      { slotType: "RB", playerId: "RB1" },
      { slotType: "WR", playerId: null },
    ]);
  });
});
