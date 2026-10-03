/**
 * T4.7: 6 hand-verified golden scenarios for the WAIVER-6 rolling-priority waiver advisor
 * (PLAN 5.6 WAIVER-6a..6d), matching `optimizer.golden.test.ts`'s house pattern: call the real
 * exported `@sideline/core` functions as a black box with hand-built inputs, document the expected
 * output's arithmetic in a comment before each assertion, so a human can audit the math.
 *
 * The 6 scenarios are the ones PLAN 5.6/9's T4.7 line names explicitly: first in waiver order, last
 * in waiver order, a competing-need-ahead case, a no-competition case, a waivers-already-cleared
 * timing case, and a daily-waivers timing case. Scenarios 1-2 and 3-4 are each built as a pair that
 * shares a single realistic league setup, so the two halves of each pair are directly comparable
 * (same candidate, only the one varying input changes) rather than two unrelated numbers.
 */
import { describe, expect, it } from "vitest";
import {
  computeClaimAdvice,
  computeCompetingClaims,
  computeFreeAgentTime,
  computeNextWaiverClear,
  computeWaiverOrder,
  computeWaiverTiming,
  DEFAULT_COMPETING_NEED_THRESHOLD,
  DEFAULT_PRIORITY_BASE_VALUE,
  DEFAULT_SEASON_WEEKS,
  type CompetingTeamRosterInput,
  type LineupImpactInput,
  type WaiverOrderRosterEntry,
} from "../../packages/core/src/index.js";

/** A 10-team league, waiver positions 1..10 with no ties (teams "T1".."T10"), used as the shared
 * backdrop for scenarios 1 and 2 (WAIVER-6a: first vs. last in the order). */
function tenTeamOrder(): WaiverOrderRosterEntry[] {
  return Array.from({ length: 10 }, (_, i) => ({
    teamId: `T${String(i + 1)}`,
    waiverPosition: i + 1,
  }));
}

/** A one-slot RB roster with a single non-IR bench player, for the `computeCompetingClaims` pairs
 * in scenarios 3-4: realistic (non-empty) rosters so `computeLineupImpact`'s delta is an actual
 * subtraction (current slot value vs. candidate value), not the degenerate "empty roster = pure
 * add" shortcut the co-located unit tests (`priority-advisor.test.ts`) already exercise. */
function oneRbRoster(existingPlayerId: string, existingValue: number): CompetingTeamRosterInput {
  return {
    teamId: existingPlayerId, // unused by the caller here; overwritten per call site below
    waiverPosition: 0,
    rosterPositions: ["RB"],
    roster: [
      {
        playerId: existingPlayerId,
        fantasyPositions: ["RB"],
        isIR: false,
        weeklyValues: { 1: existingValue },
        rosInput: { weeks: [{ week: 1, projectedPoints: existingValue }], seasonPpg: null },
      },
    ],
  };
}

describe("priority advisor golden scenarios (T4.7, WAIVER-6)", () => {
  // 1. First in waiver order ---------------------------------------------------------------------
  it("WAIVER-6a/6c: first in the waiver order makes priority maximally valuable, so a modest claim is NOT worth it", () => {
    // 10-team order, "T1" (me) holds waiverPosition 1. By hand: sorted ascending by waiverPosition
    // is already T1..T10, so T1's tie-broken rank is 1 (first).
    const order = computeWaiverOrder({ rosters: tenTeamOrder(), myTeamId: "T1" });
    expect(order.myWaiverPosition).toBe(1);
    expect(order.myRank).toBe(1);

    // computeClaimAdvice, myWaiverPosition = order.myWaiverPosition (1), full season remaining:
    //   positionFactor = max(0.2, 1 - 0.05*(1-1)) = max(0.2, 1) = 1
    //   weeksFactor     = min(1, 18/18) = 1
    //   valueOfPriority = 6 * 1 * 1 = 6
    // Candidate's Lineup Impact: empty roster -> NO_LEGAL_DROP -> pure add -> impact = week-1 value = 5.
    // 5 is NOT > 6, so worthIt must be false: holding first place is worth more than this claim.
    const lineupImpactInput: LineupImpactInput = {
      rosterPositions: ["RB"],
      roster: [],
      candidate: { playerId: "cand", fantasyPositions: ["RB"], weeklyValues: { 1: 5 } },
      weeks: [1],
    };
    const advice = computeClaimAdvice({
      lineupImpactInput,
      myWaiverPosition: order.myWaiverPosition ?? -1,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
    });
    expect(advice.positionFactor).toBeCloseTo(1, 9);
    expect(advice.weeksFactor).toBeCloseTo(1, 9);
    expect(advice.valueOfPriority).toBeCloseTo(DEFAULT_PRIORITY_BASE_VALUE, 9); // 6
    expect(advice.lineupImpact.impact).toBeCloseTo(5, 9);
    expect(advice.worthIt).toBe(false);
    expect(advice.reasons.map((r) => r.code)).toContain("CLAIM_NOT_WORTH_IT");
  });

  // 2. Last in waiver order -----------------------------------------------------------------------
  it("WAIVER-6a/6c: last in the waiver order makes priority cheap to risk, so the SAME claim becomes worth it", () => {
    // Same 10-team order, "T10" (me) holds waiverPosition 10 -> last of 10.
    const order = computeWaiverOrder({ rosters: tenTeamOrder(), myTeamId: "T10" });
    expect(order.myWaiverPosition).toBe(10);
    expect(order.myRank).toBe(10);

    // positionFactor = max(0.2, 1 - 0.05*(10-1)) = max(0.2, 1 - 0.45) = max(0.2, 0.55) = 0.55
    // weeksFactor     = 1 (full season, same as scenario 1)
    // valueOfPriority = 6 * 0.55 * 1 = 3.3
    // Same candidate (impact = 5, pure add, identical lineupImpactInput to scenario 1's). 5 > 3.3,
    // so worthIt must be true this time: priority this far back is cheap, so even a modest add
    // justifies dropping to the back (which barely costs anything, since you're already there).
    const lineupImpactInput: LineupImpactInput = {
      rosterPositions: ["RB"],
      roster: [],
      candidate: { playerId: "cand", fantasyPositions: ["RB"], weeklyValues: { 1: 5 } },
      weeks: [1],
    };
    const advice = computeClaimAdvice({
      lineupImpactInput,
      myWaiverPosition: order.myWaiverPosition ?? -1,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
    });
    expect(advice.positionFactor).toBeCloseTo(0.55, 9);
    expect(advice.weeksFactor).toBeCloseTo(1, 9);
    expect(advice.valueOfPriority).toBeCloseTo(3.3, 9);
    expect(advice.lineupImpact.impact).toBeCloseTo(5, 9);
    expect(advice.worthIt).toBe(true);
    expect(advice.reasons.map((r) => r.code)).toContain("CLAIM_WORTH_IT");
    // Sanity: exactly the pairing this scenario is for - same claim, opposite verdict by position.
    expect(advice.valueOfPriority).toBeLessThan(6);
  });

  // 3. Competing need ahead ------------------------------------------------------------------------
  it("WAIVER-6b: a team ahead of me with a real roster need is flagged; an equally needy team behind me is not", () => {
    // 10-team order, "T5" (me) at waiverPosition 5. T2 (position 2) is ahead of me; T8 (position 8)
    // is behind me. Both T2 and T8 have an identical one-player RB roster (value 2) and are
    // evaluated against the identical high-value candidate (12).
    const order = computeWaiverOrder({ rosters: tenTeamOrder(), myTeamId: "T5" });
    expect(order.myWaiverPosition).toBe(5);

    const ahead: CompetingTeamRosterInput = {
      ...oneRbRoster("T2_RB", 2),
      teamId: "T2",
      waiverPosition: 2,
    };
    const behind: CompetingTeamRosterInput = {
      ...oneRbRoster("T8_RB", 2),
      teamId: "T8",
      waiverPosition: 8,
    };

    const result = computeCompetingClaims({
      candidate: { playerId: "cand", fantasyPositions: ["RB"], weeklyValues: { 1: 12 } },
      weeks: [1],
      myWaiverPosition: order.myWaiverPosition ?? -1,
      teams: [ahead, behind],
    });

    // By hand, for EACH team: its one roster player (value 2) is the only non-IR player, so it is
    // the auto-selected drop; the "with candidate" roster is then just the candidate alone in the
    // single RB slot (12), against a "current" value of 2 (the one existing player). delta = 12-2
    // = 10, strictly greater than DEFAULT_COMPETING_NEED_THRESHOLD (3) for both teams equally - the
    // only difference between them is `aheadOfMe`.
    const t2 = result.teams.find((t) => t.teamId === "T2");
    const t8 = result.teams.find((t) => t.teamId === "T8");
    expect(t2?.lineupImpact.impact).toBeCloseTo(10, 9);
    expect(t8?.lineupImpact.impact).toBeCloseTo(10, 9);
    expect(t2?.aheadOfMe).toBe(true);
    expect(t8?.aheadOfMe).toBe(false);
    // T2 (ahead, needy) IS flagged; T8 (behind, equally needy) is NOT - `aheadOfMe` gates the flag
    // even though both teams' Lineup Impact is identical and clearly above threshold.
    expect(t2?.likelyCompeting).toBe(true);
    expect(t8?.likelyCompeting).toBe(false);
    expect(t8?.reasons.map((r) => r.code)).toContain("NOT_AHEAD_OF_ME");
  });

  // 4. No competition -------------------------------------------------------------------------------
  it("WAIVER-6b: a team ahead of me with only a marginal need is NOT flagged", () => {
    // Same 10-team order, "T5" (me). T3 (position 3) is ahead of me, with the same one-player RB
    // roster (value 2) as scenario 3, but this time the candidate is only modestly better (4, not
    // 12).
    const order = computeWaiverOrder({ rosters: tenTeamOrder(), myTeamId: "T5" });
    const ahead: CompetingTeamRosterInput = {
      ...oneRbRoster("T3_RB", 2),
      teamId: "T3",
      waiverPosition: 3,
    };

    const result = computeCompetingClaims({
      candidate: { playerId: "cand2", fantasyPositions: ["RB"], weeklyValues: { 1: 4 } },
      weeks: [1],
      myWaiverPosition: order.myWaiverPosition ?? -1,
      teams: [ahead],
    });

    // By hand: current value = 2 (T3_RB, the only roster player); with-candidate value = 4 (T3_RB
    // auto-dropped, candidate alone fills the slot). delta = 4 - 2 = 2, which is NOT > the default
    // threshold of 3 - below it, not even at the boundary (the co-located unit test already covers
    // the exact-equal boundary; this golden case is the plainly-below "no real competition" case
    // PLAN names explicitly).
    const t3 = result.teams[0];
    expect(t3?.teamId).toBe("T3");
    expect(t3?.lineupImpact.impact).toBeCloseTo(2, 9);
    expect(t3?.lineupImpact.impact).toBeLessThan(DEFAULT_COMPETING_NEED_THRESHOLD);
    expect(t3?.aheadOfMe).toBe(true); // ahead, but still not flagged - impact is just too small.
    expect(t3?.likelyCompeting).toBe(false);
    expect(t3?.reasons.map((r) => r.code)).toContain("TEAM_NEED_UNLIKELY");
  });

  // 5. Waivers already cleared (weekly, non-daily) --------------------------------------------------
  it("WAIVER-6d: a weekly league already past this week's clear rolls forward to next Monday", () => {
    // waiverDayOfWeek = 0 (Sleeper: Monday). "now" = Wednesday 2026-01-07T12:00:00Z, well after this
    // week's Monday (2026-01-05) clear already ran - the "waivers already cleared [this week]" case.
    // etUtcOffsetHours = -4 (EDT, deliberately different from the EST(-5) cases the co-located unit
    // tests already cover, so this is a genuinely new data point, not a restatement).
    //
    // By hand: etNow = now - 4h = 2026-01-07T08:00:00 (ET-labelled), a Wednesday (getUTCDay() = 3).
    // targetEtDay for Sleeper Monday (0) is JS day (0+1)%7 = 1. daysUntil = (1 - 3 + 7) % 7 = 5, so
    // the next Monday is Jan 7 + 5 = Jan 12 (matches "2026-01-05 is a Monday" from the unit tests:
    // the following Monday is the 12th). candidateEt = 2026-01-12T03:00:00 (03:00 ET clear hour),
    // which is already after etNow, so no further roll-forward is needed. nextClearAt = candidateEt
    // - offsetMs = 03:00 + 4h = 2026-01-12T07:00:00.000Z.
    const clear = computeNextWaiverClear({
      now: new Date("2026-01-07T12:00:00.000Z"),
      waiverDayOfWeek: 0,
      etUtcOffsetHours: -4,
    });
    expect(clear.nextClearAt.toISOString()).toBe("2026-01-12T07:00:00.000Z");
    expect(clear.reasons.map((r) => r.code)).toContain("WAIVER_CLEAR_SCHEDULE");

    // The convenience wrapper also reports a dropped player's free-agent time independently of the
    // weekly schedule: dropped Tuesday 2026-01-06T00:00:00Z with a 1-day waiverClearDays (different
    // from the unit tests' 2-day example) -> free agent at 2026-01-07T00:00:00.000Z.
    const freeAgent = computeFreeAgentTime({
      droppedAt: new Date("2026-01-06T00:00:00.000Z"),
      waiverClearDays: 1,
    });
    expect(freeAgent.freeAgentAt.toISOString()).toBe("2026-01-07T00:00:00.000Z");

    const timing = computeWaiverTiming({
      now: new Date("2026-01-07T12:00:00.000Z"),
      waiverDayOfWeek: 0,
      waiverClearDays: 1,
      etUtcOffsetHours: -4,
      droppedAt: new Date("2026-01-06T00:00:00.000Z"),
    });
    expect(timing.nextClearAt.toISOString()).toBe("2026-01-12T07:00:00.000Z");
    expect(timing.freeAgentAt?.toISOString()).toBe("2026-01-07T00:00:00.000Z");
  });

  // 6. Daily waivers, custom clear hour --------------------------------------------------------------
  it("WAIVER-6d: a daily-waivers league processes every day, honoring a non-default clear hour", () => {
    // dailyWaivers = true, clearHourEt = 5 (not the default 3, to prove the override is honored),
    // etUtcOffsetHours = -5 (EST). "now" = 2026-02-02T08:00:00Z.
    //
    // By hand: etNow = now - 5h = 2026-02-02T03:00:00 (ET-labelled), i.e. 03:00 ET, before today's
    // 05:00 ET clear. treatAsDaily -> targetEtDay = etNow's own day (no day-of-week logic at all).
    // daysUntil = 0 -> candidateEt = 2026-02-02T05:00:00 (ET-labelled), which is after etNow (03:00),
    // so no roll-forward needed. nextClearAt = candidateEt - offsetMs = 05:00 + 5h =
    // 2026-02-02T10:00:00.000Z.
    const result = computeNextWaiverClear({
      now: new Date("2026-02-02T08:00:00.000Z"),
      waiverDayOfWeek: 2, // ignored entirely because dailyWaivers is true
      dailyWaivers: true,
      clearHourEt: 5,
      etUtcOffsetHours: -5,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-02-02T10:00:00.000Z");
    expect(result.reasons.map((r) => r.code)).not.toContain("WAIVER_DAY_UNKNOWN_ASSUMED_DAILY");
    expect(result.reasons.find((r) => r.code === "WAIVER_CLEAR_SCHEDULE")?.label).toContain(
      "daily",
    );
    expect(result.reasons.find((r) => r.code === "WAIVER_CLEAR_SCHEDULE")?.label).toContain(
      "5:00 ET",
    );
  });
});
