/**
 * T3.6: 12 hand-verified golden scenarios for the lineup optimizer (LINEUP-1..LINEUP-9, PLAN 5.4).
 * These call `recommendLineup`/`resolveSlots` as a black box (their real exported behavior) with
 * hand-built inputs; each scenario's expected output is computed by hand in a comment before the
 * assertions, so a human can audit the math.
 *
 * Shared availability math used throughout: Out/IR/Suspended/bye => value 0 (reason UNAVAILABLE);
 * Doubtful => value * 0.25; Questionable => value * 0.9; anything else passes rawValue through.
 */
import { describe, expect, it } from "vitest";
import {
  isPlayerEligibleForSlot,
  recommendLineup,
  resolveSlots,
  type RecommendLineupPlayer,
} from "../../packages/core/src/index.js";
import { LOCKED_KICKOFF, NOT_LOCKED_KICKOFF, NOW, player, slot } from "./optimizer-fixtures.js";

describe("optimizer golden scenarios (T3.6)", () => {
  // 1. Superflex -------------------------------------------------------------------------------
  it("LINEUP-1/LINEUP-2: superflex accepts QB/RB/WR/TE and picks the best of them", () => {
    // SLOT_ELIGIBILITY.SUPER_FLEX = [QB, RB, WR, TE]; confirm each position is individually
    // eligible for the slot.
    const eligible = ["QB", "RB", "WR", "TE"];
    for (const pos of eligible) {
      expect(isPlayerEligibleForSlot([pos], eligible)).toBe(true);
    }
    expect(isPlayerEligibleForSlot(["K"], eligible)).toBe(false);

    // By hand: QB(25) > RB(18) > WR(15) > TE(10). The single SUPER_FLEX slot must take the QB.
    const slots = [slot("SUPER_FLEX", eligible)];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "QB1", fantasyPositions: ["QB"], rawValue: 25 }),
      player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 18 }),
      player({ playerId: "WR1", fantasyPositions: ["WR"], rawValue: 15 }),
      player({ playerId: "TE1", fantasyPositions: ["TE"], rawValue: 10 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "SUPER_FLEX", playerId: "QB1" }]);
    expect(result.pointDelta).toBeCloseTo(25, 9);
  });

  // 2. Two flex types ----------------------------------------------------------------------------
  it("LINEUP-2: allocates across REC_FLEX and WRRB_FLEX globally, not by naive slot order", () => {
    // REC_FLEX = [WR, TE], WRRB_FLEX = [RB, WR]. The only shared-eligibility player is the WR.
    // By hand, with slots processed in list order [REC_FLEX, WRRB_FLEX]:
    //   TE1 = 5  (REC_FLEX only)
    //   RB1 = 1  (WRRB_FLEX only)
    //   WR1 = 20 (both)
    // A naive "fill REC_FLEX first with its single best eligible player" greedy would pick WR1 for
    // REC_FLEX (20 > 5), leaving only RB1 (1) for WRRB_FLEX: total 21.
    // The true optimum frees WR1 for WRRB_FLEX (where it is the only strong option) and gives
    // REC_FLEX to TE1 instead: REC_FLEX=TE1(5) + WRRB_FLEX=WR1(20) = 25, which beats 21.
    // Brute-force check of all 4 valid pairings confirms 25 is the max:
    //   REC=WR1,WRRB=RB1 -> 21 | REC=TE1,WRRB=WR1 -> 25 | REC=TE1,WRRB=RB1 -> 6 | REC=WR1 only -> 20
    const slots = [slot("REC_FLEX", ["WR", "TE"]), slot("WRRB_FLEX", ["RB", "WR"])];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "TE1", fantasyPositions: ["TE"], rawValue: 5 }),
      player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 1 }),
      player({ playerId: "WR1", fantasyPositions: ["WR"], rawValue: 20 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null, null],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([
      { slotType: "REC_FLEX", playerId: "TE1" },
      { slotType: "WRRB_FLEX", playerId: "WR1" },
    ]);
    expect(result.pointDelta).toBeCloseTo(25, 9);
  });

  // 3. Bye -----------------------------------------------------------------------------------------
  it("LINEUP-4: a bye player is never started when an alternative exists, else the slot is empty", () => {
    // Sub-case A: RB_bye(20, isBye) vs RB_healthy(5). Bye value is zeroed, so even though its raw
    // value is far higher, RB_healthy(5) must win (5 > 0).
    const slots = [slot("RB", ["RB"])];
    const withAlternative: RecommendLineupPlayer[] = [
      player({ playerId: "RB_bye", fantasyPositions: ["RB"], rawValue: 20, isBye: true }),
      player({ playerId: "RB_healthy", fantasyPositions: ["RB"], rawValue: 5 }),
    ];
    const resultA = recommendLineup({
      slots,
      slotWarnings: [],
      players: withAlternative,
      currentAssignment: [null],
      now: NOW,
    });
    expect(resultA.optimalAssignment).toEqual([{ slotType: "RB", playerId: "RB_healthy" }]);
    expect(resultA.playerReasons["RB_bye"]).toEqual([
      { code: "UNAVAILABLE", label: "On bye this week", impact: -20, projectedPoints: 20 },
    ]);

    // Sub-case B: the only candidate is on bye. Per the B1 fix, the solver never prefers a
    // non-positive-value player over leaving the slot empty, so the slot must resolve to null
    // with an EMPTY_SLOT issue rather than starting the bye player.
    const onlyByeCandidate: RecommendLineupPlayer[] = [
      player({ playerId: "RB_bye", fantasyPositions: ["RB"], rawValue: 20, isBye: true }),
    ];
    const resultB = recommendLineup({
      slots,
      slotWarnings: [],
      players: onlyByeCandidate,
      currentAssignment: [null],
      now: NOW,
    });
    expect(resultB.optimalAssignment).toEqual([{ slotType: "RB", playerId: null }]);
    expect(resultB.issues).toContainEqual({
      code: "EMPTY_SLOT",
      label: "No one on your roster can fill RB",
      value: "RB",
    });
  });

  // 4. Locked starter --------------------------------------------------------------------------
  it("LINEUP-3: a locked starter stays in their slot despite a better bench option", () => {
    // RB1 (value 10) is currently started and already locked (kickoff before NOW). RB2 (value 25)
    // is on the bench and not locked. Without the lock, RB2 would clearly be optimal (25 > 10),
    // but the locked slot is pinned to its current starter, so RB1 must remain and RB2 must not
    // be swapped in. pointDelta is exactly 0 (no change is made at all).
    const slots = [slot("RB", ["RB"])];
    const players: RecommendLineupPlayer[] = [
      player({
        playerId: "RB1",
        fantasyPositions: ["RB"],
        rawValue: 10,
        kickoffUtc: LOCKED_KICKOFF,
      }),
      player({
        playerId: "RB2",
        fantasyPositions: ["RB"],
        rawValue: 25,
        kickoffUtc: NOT_LOCKED_KICKOFF,
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
  });

  // 5. Locked bench player ---------------------------------------------------------------------
  it("LINEUP-3: a locked bench player cannot be newly assigned despite being the best option", () => {
    // RB_bench (value 25) is on the bench, not a current starter, and locked (kickoff already
    // passed). RB_starter (value 10) is the current starter and not locked. By the lock rule, a
    // locked non-starter is excluded from the solver entirely, so the only remaining eligible
    // candidate for the RB slot is RB_starter. The optimal assignment must therefore keep
    // RB_starter even though RB_bench's raw value is higher; no swap occurs.
    const slots = [slot("RB", ["RB"])];
    const players: RecommendLineupPlayer[] = [
      player({
        playerId: "RB_starter",
        fantasyPositions: ["RB"],
        rawValue: 10,
        kickoffUtc: NOT_LOCKED_KICKOFF,
      }),
      player({
        playerId: "RB_bench",
        fantasyPositions: ["RB"],
        rawValue: 25,
        kickoffUtc: LOCKED_KICKOFF,
      }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB_starter"],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "RB", playerId: "RB_starter" }]);
    expect(result.swaps).toEqual([]);
    expect(result.optimalAssignment.some((a) => a.playerId === "RB_bench")).toBe(false);
  });

  // 6. IR ----------------------------------------------------------------------------------------
  it("LINEUP-4: an IR player is never recommended over healthy alternatives in a full roster", () => {
    // Two RB slots. RB_ir(30, status IR) is zeroed. RB_h1(12) and RB_h2(8) are healthy. By hand,
    // the only two positive-value candidates are RB_h1 and RB_h2, so both slots must be filled by
    // them (12 + 8 = 20) and RB_ir must never appear, regardless of its much higher raw value.
    const slots = [slot("RB", ["RB"]), slot("RB", ["RB"])];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "RB_ir", fantasyPositions: ["RB"], rawValue: 30, status: "IR" }),
      player({ playerId: "RB_h1", fantasyPositions: ["RB"], rawValue: 12 }),
      player({ playerId: "RB_h2", fantasyPositions: ["RB"], rawValue: 8 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null, null],
      now: NOW,
    });

    const assignedIds = result.optimalAssignment.map((a) => a.playerId).sort();
    expect(assignedIds).toEqual(["RB_h1", "RB_h2"]);
    expect(result.pointDelta).toBeCloseTo(20, 9);
  });

  // 7. Doubtful ------------------------------------------------------------------------------------
  it("LINEUP-4: a Doubtful player (0.25x) wins only when its discounted value is still higher", () => {
    // Sub-case A: Doubtful raw 100 -> adjusted 25. Healthy alternative raw 20. 25 > 20, so the
    // Doubtful player should still start.
    const slots = [slot("WR", ["WR"])];
    const doubtfulWins: RecommendLineupPlayer[] = [
      player({
        playerId: "WR_doubtful",
        fantasyPositions: ["WR"],
        rawValue: 100,
        status: "Doubtful",
      }),
      player({ playerId: "WR_healthy", fantasyPositions: ["WR"], rawValue: 20 }),
    ];
    const resultA = recommendLineup({
      slots,
      slotWarnings: [],
      players: doubtfulWins,
      currentAssignment: [null],
      now: NOW,
    });
    expect(resultA.optimalAssignment).toEqual([{ slotType: "WR", playerId: "WR_doubtful" }]);
    expect(resultA.pointDelta).toBeCloseTo(25, 9);

    // Sub-case B: Doubtful raw 40 -> adjusted 10. Healthy alternative raw 15. 15 > 10, so the
    // healthy player should start instead.
    const healthyWins: RecommendLineupPlayer[] = [
      player({
        playerId: "WR_doubtful",
        fantasyPositions: ["WR"],
        rawValue: 40,
        status: "Doubtful",
      }),
      player({ playerId: "WR_healthy", fantasyPositions: ["WR"], rawValue: 15 }),
    ];
    const resultB = recommendLineup({
      slots,
      slotWarnings: [],
      players: healthyWins,
      currentAssignment: [null],
      now: NOW,
    });
    expect(resultB.optimalAssignment).toEqual([{ slotType: "WR", playerId: "WR_healthy" }]);
    expect(resultB.pointDelta).toBeCloseTo(15, 9);
  });

  // 8. Empty slot ------------------------------------------------------------------------------
  it("LINEUP-6: a slot with zero eligible candidates anywhere resolves to null with EMPTY_SLOT", () => {
    // No DEF-eligible player exists in the pool at all, so the DEF slot has nothing it could ever
    // be assigned; expect null plus an EMPTY_SLOT issue naming the slot type.
    const slots = [slot("DEF", ["DEF"])];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 10 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([{ slotType: "DEF", playerId: null }]);
    expect(result.issues).toContainEqual({
      code: "EMPTY_SLOT",
      label: "No one on your roster can fill DEF",
      value: "DEF",
    });
  });

  // 9. Unknown slot type -------------------------------------------------------------------------
  it("LINEUP-1: an unknown roster_positions entry warns and flows through to issues unchanged", () => {
    // "SUPERFLEX_X" is not a key of SLOT_ELIGIBILITY, so resolveSlots must drop it from `slots`
    // and report it as a warning; recommendLineup must pass that exact warning object through to
    // `issues` untouched (it never synthesizes its own unknown-slot message).
    const { slots, warnings } = resolveSlots(["RB", "SUPERFLEX_X"]);
    expect(slots).toEqual([{ slotType: "RB", eligiblePositions: ["RB"] }]);
    expect(warnings).toEqual([
      {
        code: "UNKNOWN_SLOT_TYPE",
        label: `"SUPERFLEX_X" is a roster slot we don't recognize`,
        value: "SUPERFLEX_X",
      },
    ]);

    const players: RecommendLineupPlayer[] = [
      player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 10 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: warnings,
      players,
      currentAssignment: [null],
      now: NOW,
    });
    expect(result.issues).toContainEqual(warnings[0]);
  });

  // 10. IDP ------------------------------------------------------------------------------------
  it("LINEUP-1/LINEUP-2: DL/LB/DB slots plus IDP_FLEX accepting any of the three", () => {
    // Slots: DL, LB, DB, IDP_FLEX. Players: DL1=12, DL2=10, LB1=9, DB1=8.
    // By hand: DL slot must take DL1 (the only way to realize DL1's value, since DL1 is only
    // eligible for DL/IDP_FLEX and DL is its highest-value outlet). LB slot takes LB1(9), DB slot
    // takes DB1(8). IDP_FLEX (accepts DL/LB/DB) then takes the best remaining IDP player, DL2(10).
    // Total = 12 + 9 + 8 + 10 = 39. Brute-force confirms no reassignment beats this (e.g. moving
    // DL2 to DL and DL1 to IDP_FLEX gives the same 39 by symmetry of value, but every alternative
    // that benches a positive-value player instead scores lower).
    const slots = [
      slot("DL", ["DL"]),
      slot("LB", ["LB"]),
      slot("DB", ["DB"]),
      slot("IDP_FLEX", ["DL", "LB", "DB"]),
    ];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "DL1", fantasyPositions: ["DL"], rawValue: 12 }),
      player({ playerId: "DL2", fantasyPositions: ["DL"], rawValue: 10 }),
      player({ playerId: "LB1", fantasyPositions: ["LB"], rawValue: 9 }),
      player({ playerId: "DB1", fantasyPositions: ["DB"], rawValue: 8 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: [null, null, null, null],
      now: NOW,
    });

    const byType = Object.fromEntries(
      result.optimalAssignment.map((a) => [a.slotType, a.playerId]),
    );
    expect(byType["LB"]).toBe("LB1");
    expect(byType["DB"]).toBe("DB1");
    expect([byType["DL"], byType["IDP_FLEX"]].sort()).toEqual(["DL1", "DL2"]);
    expect(result.pointDelta).toBeCloseTo(39, 9);
  });

  // 11. Tie in values --------------------------------------------------------------------------
  it("LINEUP-2: an exact value tie is broken deterministically toward the lower playerId", () => {
    // B2 and A1 both have adjusted value 10 and are both eligible for the single RB slot. The
    // solver's documented tie-break favors the lexicographically lower playerId, so A1 ("A1" <
    // "B2") must always be chosen, not just on one lucky run.
    const slots = [slot("RB", ["RB"])];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "B2", fantasyPositions: ["RB"], rawValue: 10 }),
      player({ playerId: "A1", fantasyPositions: ["RB"], rawValue: 10 }),
    ];
    for (let i = 0; i < 5; i++) {
      const result = recommendLineup({
        slots,
        slotWarnings: [],
        players,
        currentAssignment: [null],
        now: NOW,
      });
      expect(result.optimalAssignment).toEqual([{ slotType: "RB", playerId: "A1" }]);
    }
  });

  // 12. All-bench-better -------------------------------------------------------------------------
  it("LINEUP-6: every bench player beating every starter produces a full swap-out", () => {
    // Current starters RB1(5) and WR1(5); bench RB2(20) and WR2(20) both strictly better. By
    // hand, the optimal lineup swaps both: RB slot -> RB2, WR slot -> WR2. pointDelta is
    // (20 + 20) - (5 + 5) = 30. Both slots must appear in swaps with the correct in/out ids.
    const slots = [slot("RB", ["RB"]), slot("WR", ["WR"])];
    const players: RecommendLineupPlayer[] = [
      player({ playerId: "RB1", fantasyPositions: ["RB"], rawValue: 5 }),
      player({ playerId: "RB2", fantasyPositions: ["RB"], rawValue: 20 }),
      player({ playerId: "WR1", fantasyPositions: ["WR"], rawValue: 5 }),
      player({ playerId: "WR2", fantasyPositions: ["WR"], rawValue: 20 }),
    ];
    const result = recommendLineup({
      slots,
      slotWarnings: [],
      players,
      currentAssignment: ["RB1", "WR1"],
      now: NOW,
    });

    expect(result.optimalAssignment).toEqual([
      { slotType: "RB", playerId: "RB2" },
      { slotType: "WR", playerId: "WR2" },
    ]);
    expect(result.swaps).toEqual([
      { slotIndex: 0, slotType: "RB", playerIdIn: "RB2", playerIdOut: "RB1" },
      { slotIndex: 1, slotType: "WR", playerIdIn: "WR2", playerIdOut: "WR1" },
    ]);
    expect(result.pointDelta).toBeCloseTo(30, 9);
  });
});
