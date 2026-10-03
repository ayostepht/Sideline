import { describe, expect, it } from "vitest";
import {
  computeLineupImpact,
  type LineupImpactCandidate,
  type LineupImpactRosterPlayer,
} from "./lineup-impact.js";

// 4 fillable slots after resolveSlots drops BN: QB, RB, WR, FLEX (RB/WR/TE).
const ROSTER_POSITIONS = ["QB", "RB", "WR", "FLEX", "BN", "BN"];

function rosterPlayer(
  playerId: string,
  fantasyPositions: readonly string[],
  weeklyValues: Record<number, number>,
  rosPoints: number,
  isIR = false,
): LineupImpactRosterPlayer {
  return {
    playerId,
    fantasyPositions,
    isIR,
    weeklyValues,
    rosInput: { weeks: [{ week: 1, projectedPoints: rosPoints }], seasonPpg: null },
  };
}

// Hand-computed base roster (see module test comments for the arithmetic):
// QB1 20 (QB, ROS 150), RB1 15 (RB, ROS 100), WR1 12 (WR, ROS 90),
// RB2 8 (RB, ROS 40), WR2 5 (WR, ROS 20), TE1 3 (TE, ROS 10 - lowest, auto-dropped).
// Optimal: QB1(20) + RB1(15) + WR1(12) + FLEX best-of{RB2(8), WR2(5), TE1(3)}=RB2(8) = 55.
function baseRoster(te1Week1 = 3): LineupImpactRosterPlayer[] {
  return [
    rosterPlayer("QB1", ["QB"], { 1: 20 }, 150),
    rosterPlayer("RB1", ["RB"], { 1: 15 }, 100),
    rosterPlayer("WR1", ["WR"], { 1: 12 }, 90),
    rosterPlayer("RB2", ["RB"], { 1: 8 }, 40),
    rosterPlayer("WR2", ["WR"], { 1: 5 }, 20),
    rosterPlayer("TE1", ["TE"], { 1: te1Week1 }, 10),
  ];
}

describe("computeLineupImpact (WAIVER-2)", () => {
  it("is positive for a candidate that clearly improves the lineup, auto-selecting the lowest-ROS drop", () => {
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 18 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster: baseRoster(),
      candidate,
      weeks: [1],
    });

    // TE1 has the lowest ROS value (10) among non-IR roster players, so it is auto-dropped.
    expect(result.droppedPlayerId).toBe("TE1");
    expect(result.reasons.some((r) => r.code === "SUGGESTED_DROP")).toBe(true);
    // Current: 55 (see baseRoster comment). With candidate (drop TE1): QB1+RB1+WR1+FLEX(CAND=18) = 65.
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 55, withCandidateValue: 65, delta: 10 },
    ]);
    expect(result.impact).toBeCloseTo(10, 9);
  });

  it("is negative when the auto-selected (lowest season-long ROS) drop is this week's best bench option", () => {
    // TE1's ROS value stays the lowest (10) across the season, but this single week it has an
    // unusually strong value (25) - e.g. a great matchup - so dropping it costs real points now.
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 2 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster: baseRoster(25),
      candidate,
      weeks: [1],
    });

    expect(result.droppedPlayerId).toBe("TE1");
    // Current: QB1(20)+RB1(15)+WR1(12)+FLEX best-of{RB2(8),WR2(5),TE1(25)}=TE1(25) = 72.
    // With candidate (drop TE1): FLEX best-of{RB2(8),WR2(5),CAND(2)}=RB2(8) -> 20+15+12+8 = 55.
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 72, withCandidateValue: 55, delta: -17 },
    ]);
    expect(result.impact).toBeCloseTo(-17, 9);
  });

  it("uses an explicit dropPlayerId override instead of auto-selecting", () => {
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 18 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster: baseRoster(),
      candidate,
      weeks: [1],
      dropPlayerId: "RB1",
    });

    expect(result.droppedPlayerId).toBe("RB1");
    expect(result.reasons.find((r) => r.code === "SUGGESTED_DROP")?.label).toContain("override");
    // With RB1 dropped: QB1(20) + best assignment of {WR1(12), RB2(8), WR2(5), TE1(3), CAND(18,RB)}
    // into RB/WR/FLEX = CAND or RB2 at RB (18 or 8) + WR1(12) at WR + the other RB-eligible one at
    // FLEX: optimal total for those 3 slots is 18 (CAND) + 12 (WR1) + 8 (RB2) = 38, so lineup = 58.
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 55, withCandidateValue: 58, delta: 3 },
    ]);
    expect(result.impact).toBeCloseTo(3, 9);
  });

  it("falls back to a pure add with a DROP_PLAYER_NOT_ON_ROSTER reason when the override id is unknown", () => {
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster: baseRoster(),
      candidate,
      weeks: [1],
      dropPlayerId: "NOT-ON-ROSTER",
    });

    expect(result.droppedPlayerId).toBeNull();
    expect(result.reasons.some((r) => r.code === "DROP_PLAYER_NOT_ON_ROSTER")).toBe(true);
  });

  it("breaks an exact ROS-value tie in auto-drop selection by ascending playerId", () => {
    const roster = [
      rosterPlayer("QB1", ["QB"], { 1: 20 }, 150),
      rosterPlayer("ZZZ", ["TE"], { 1: 3 }, 10),
      rosterPlayer("AAA", ["TE"], { 1: 3 }, 10),
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["TE"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "FLEX", "BN"],
      roster,
      candidate,
      weeks: [1],
    });
    expect(result.droppedPlayerId).toBe("AAA");
  });

  it("treats a roster player's bye week (no weeklyValues entry) and a candidate's missing week as 0, not a crash", () => {
    const roster = [
      rosterPlayer("QB1", ["QB"], {}, 150), // no entry for week 1: bye
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["QB"],
      weeklyValues: {}, // no entry for week 1 either
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "BN"],
      roster,
      candidate,
      weeks: [1],
      dropPlayerId: "QB1",
    });
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 0, withCandidateValue: 0, delta: 0 },
    ]);
  });

  it("handles the degenerate case where every roster player is on IR (no legal auto-drop) without crashing", () => {
    const roster = baseRoster().map((p) => ({ ...p, isIR: true }));
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster,
      candidate,
      weeks: [1],
    });

    expect(result.droppedPlayerId).toBeNull();
    expect(result.reasons.some((r) => r.code === "NO_LEGAL_DROP")).toBe(true);
    // Pure add: candidate is simply additionally available, nobody removed.
    expect(result.weeklyImpact[0]?.currentValue).toBe(55);
  });

  it("handles a completely empty roster (no legal drop, no players at all) without crashing", () => {
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["QB"],
      weeklyValues: { 1: 10 },
    };
    const result = computeLineupImpact({
      rosterPositions: ROSTER_POSITIONS,
      roster: [],
      candidate,
      weeks: [1],
    });

    expect(result.droppedPlayerId).toBeNull();
    expect(result.reasons.some((r) => r.code === "NO_LEGAL_DROP")).toBe(true);
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 0, withCandidateValue: 10, delta: 10 },
    ]);
    expect(result.impact).toBeCloseTo(10, 9);
  });

  it("sums delta across multiple weeks", () => {
    const roster = [
      rosterPlayer("QB1", ["QB"], { 1: 20, 2: 22 }, 150),
      rosterPlayer("RB1", ["RB"], { 1: 15, 2: 10 }, 100),
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 5, 2: 30 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "RB", "BN"],
      roster,
      candidate,
      weeks: [1, 2],
      dropPlayerId: "RB1",
    });

    // Week 1: current QB1+RB1=35; with candidate (drop RB1): QB1+CAND(5)=25; delta=-10.
    // Week 2: current QB1+RB1=32; with candidate (drop RB1): QB1+CAND(30)=52; delta=20.
    expect(result.weeklyImpact).toEqual([
      { week: 1, currentValue: 35, withCandidateValue: 25, delta: -10 },
      { week: 2, currentValue: 32, withCandidateValue: 52, delta: 20 },
    ]);
    expect(result.impact).toBeCloseTo(10, 9);
  });

  it("never auto-drops the only DEF-eligible player when the league requires a starting DEF, even when that DEF is the lowest-ROS-value player (bug fix)", () => {
    // League requires a starting DEF. Roster has exactly one DEF-eligible player (lowest ROS
    // value on the roster, 5) and a clearly safe, non-critical low-value bench WR (ROS 8) who
    // isn't the only one filling any required slot (there's another WR too).
    const roster = [
      rosterPlayer("QB1", ["QB"], { 1: 20 }, 150),
      rosterPlayer("RB1", ["RB"], { 1: 15 }, 100),
      rosterPlayer("WR1", ["WR"], { 1: 12 }, 90),
      rosterPlayer("WR2", ["WR"], { 1: 1 }, 8), // safe to drop: not the only WR
      rosterPlayer("DEF1", ["DEF"], { 1: 4 }, 5), // lowest ROS overall, but the ONLY DEF
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "RB", "WR", "DEF", "BN"],
      roster,
      candidate,
      weeks: [1],
    });

    expect(result.droppedPlayerId).toBe("WR2");
    expect(result.droppedPlayerId).not.toBe("DEF1");
  });

  it("allows auto-dropping a DEF when a second DEF-eligible player remains to fill the required slot", () => {
    const roster = [
      rosterPlayer("QB1", ["QB"], { 1: 20 }, 150),
      rosterPlayer("RB1", ["RB"], { 1: 15 }, 100),
      rosterPlayer("WR1", ["WR"], { 1: 12 }, 90),
      rosterPlayer("DEF1", ["DEF"], { 1: 4 }, 5), // tied lowest ROS, but a safe drop now
      rosterPlayer("DEF2", ["DEF"], { 1: 4 }, 5), // the other DEF remains to fill the slot
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "RB", "WR", "DEF", "BN"],
      roster,
      candidate,
      weeks: [1],
    });

    // Both DEFs are equally safe (one remains either way); tie-break is ascending playerId.
    expect(result.droppedPlayerId).toBe("DEF1");
  });

  it("falls back to the plain lowest-ROS-value pick when the roster is already short-staffed before any drop", () => {
    // League requires 2 WR but this roster only has 1 active WR-eligible player: already
    // infeasible before any drop. The fix must not incorrectly report NO_LEGAL_DROP here; it
    // should fall back to today's unrestricted lowest-ROS-value behavior.
    const roster = [
      rosterPlayer("QB1", ["QB"], { 1: 20 }, 150),
      rosterPlayer("RB1", ["RB"], { 1: 15 }, 100),
      rosterPlayer("WR1", ["WR"], { 1: 12 }, 90),
      rosterPlayer("TE1", ["TE"], { 1: 3 }, 10), // lowest ROS value
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["RB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "RB", "WR", "WR", "BN"], // 2 WR slots required, only 1 WR rostered
      roster,
      candidate,
      weeks: [1],
    });

    expect(result.droppedPlayerId).toBe("TE1");
    expect(result.reasons.some((r) => r.code === "NO_LEGAL_DROP")).toBe(false);
  });

  it("accounts for shared flex eligibility (not a naive per-position headcount) when checking slot feasibility", () => {
    // Slots: RB, WR, FLEX(RB/WR/TE). Roster: RB1, WR1, WR2, TE1 (TE1 lowest ROS). A naive
    // "exact position headcount" check might reason "TE1 is the only TE, and FLEX could need a
    // TE, so TE1 looks load-bearing" and wrongly block dropping it. In fact TE1 is perfectly safe
    // to drop: WR2 (not needed by the single direct WR slot once WR1 covers it) can fill FLEX
    // instead, since FLEX also accepts WR. Only the real bipartite solve sees that redundancy.
    const roster = [
      rosterPlayer("RB1", ["RB"], { 1: 15 }, 100),
      rosterPlayer("WR1", ["WR"], { 1: 12 }, 90),
      rosterPlayer("WR2", ["WR"], { 1: 5 }, 20),
      rosterPlayer("TE1", ["TE"], { 1: 3 }, 10), // lowest ROS; safe via WR2's shared flex eligibility
    ];
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["TE"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["RB", "WR", "FLEX", "BN"],
      roster,
      candidate,
      weeks: [1],
    });

    // Full roster: RB1->RB, WR1->WR, FLEX->WR2 or TE1 (feasible either way). Dropping TE1 leaves
    // RB1->RB, WR1->WR, FLEX->WR2: still feasible, so TE1 (the true lowest-ROS player) is
    // correctly allowed as the auto-drop; an over-conservative naive headcount would have
    // excluded it and picked WR2 instead.
    expect(result.droppedPlayerId).toBe("TE1");
  });

  it("passes through unknown-slot-type warnings from resolveSlots", () => {
    const candidate: LineupImpactCandidate = {
      playerId: "CAND",
      fantasyPositions: ["QB"],
      weeklyValues: { 1: 1 },
    };
    const result = computeLineupImpact({
      rosterPositions: ["QB", "MYSTERY_SLOT"],
      roster: [],
      candidate,
      weeks: [1],
    });
    expect(result.reasons.some((r) => r.code === "UNKNOWN_SLOT_TYPE")).toBe(true);
  });
});
