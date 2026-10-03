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
      { code: "LOCKED", label: "Locked: game has started" },
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
        label: "Locked: game has started (estimated kickoff time)",
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
      { code: "EMPTY_SLOT", label: "No eligible player available for DEF", value: "DEF" },
    ]);
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
      label: "Currently started player RB1 is unavailable",
      value: "RB1",
    });
  });

  it("passes an unknown-slot-type warning through unchanged into issues", () => {
    const slotWarnings = [
      {
        code: "UNKNOWN_SLOT_TYPE",
        label: 'Unknown roster slot type "FOO" cannot be filled',
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
