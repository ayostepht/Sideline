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
  DEFAULT_PRIORITY_MIN_POSITION_FACTOR,
  DEFAULT_PRIORITY_POSITION_DECAY_PER_SLOT,
  DEFAULT_SEASON_WEEKS,
  type FailedClaimRecord,
} from "./priority-advisor.js";
import type { LineupImpactInput } from "./lineup-impact.js";

describe("computeWaiverOrder (WAIVER-6a)", () => {
  it("sorts by waiverPosition and reports my position and rank", () => {
    const result = computeWaiverOrder({
      myTeamId: "B",
      rosters: [
        { teamId: "D", waiverPosition: 3 },
        { teamId: "A", waiverPosition: 1 },
        { teamId: "B", waiverPosition: 2 },
      ],
    });
    expect(result.order.map((e) => e.teamId)).toEqual(["A", "B", "D"]);
    expect(result.myWaiverPosition).toBe(2);
    expect(result.myRank).toBe(2);
    expect(result.reasons.find((r) => r.code === "WAIVER_POSITION")).toBeDefined();
  });

  it("breaks ties in waiverPosition by ascending teamId", () => {
    // A=1, then B and C tie at 2 ("B" < "C" so B ranks first), D=3.
    const result = computeWaiverOrder({
      myTeamId: "C",
      rosters: [
        { teamId: "A", waiverPosition: 1 },
        { teamId: "C", waiverPosition: 2 },
        { teamId: "B", waiverPosition: 2 },
        { teamId: "D", waiverPosition: 3 },
      ],
    });
    expect(result.order.map((e) => e.teamId)).toEqual(["A", "B", "C", "D"]);
    expect(result.order.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    // C's raw waiverPosition (2) differs from its tie-broken rank (3).
    expect(result.myWaiverPosition).toBe(2);
    expect(result.myRank).toBe(3);
  });

  it("reports MY_TEAM_NOT_FOUND without crashing when myTeamId is absent", () => {
    const result = computeWaiverOrder({
      myTeamId: "Z",
      rosters: [{ teamId: "A", waiverPosition: 1 }],
    });
    expect(result.myWaiverPosition).toBeNull();
    expect(result.myRank).toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("MY_TEAM_NOT_FOUND");
  });
});

describe("computeCompetingClaims (WAIVER-6b)", () => {
  // The team's roster is empty and has exactly one fillable RB slot, so its "current" optimal
  // value is always 0 and `computeLineupImpact`'s "pure add" path makes `impact` exactly equal to
  // the candidate's week-1 weekly value (no drop to net against). This isolates the
  // threshold/flagging logic under test from Lineup Impact's own (separately tested) arithmetic.
  // Returns the single evaluated team's result directly (every call here evaluates one team).
  function runSingleTeam(
    team: { teamId: string; waiverPosition: number; value: number },
    opts?: {
      threshold?: number;
      failedClaimHistory?: readonly FailedClaimRecord[];
      myWaiverPosition?: number;
    },
  ) {
    const result = computeCompetingClaims({
      candidate: { playerId: "cand", fantasyPositions: ["RB"], weeklyValues: { 1: team.value } },
      weeks: [1],
      myWaiverPosition: opts?.myWaiverPosition ?? 5,
      teams: [
        {
          teamId: team.teamId,
          waiverPosition: team.waiverPosition,
          rosterPositions: ["RB"],
          roster: [],
        },
      ],
      ...(opts?.threshold !== undefined ? { threshold: opts.threshold } : {}),
      ...(opts?.failedClaimHistory !== undefined
        ? { failedClaimHistory: opts.failedClaimHistory }
        : {}),
    });
    const [team0] = result.teams;
    if (team0 === undefined) {
      throw new Error("expected exactly one team result");
    }
    return team0;
  }

  it("flags a team clearly above the threshold as likely competing", () => {
    const team0 = runSingleTeam({ teamId: "A", waiverPosition: 1, value: 10 });
    expect(team0.lineupImpact.impact).toBeCloseTo(10, 6);
    expect(team0.aheadOfMe).toBe(true);
    expect(team0.likelyCompeting).toBe(true);
    expect(team0.reasons.map((r) => r.code)).toContain("TEAM_NEED_LIKELY");
  });

  it("does not flag a team clearly below the threshold", () => {
    const team0 = runSingleTeam({ teamId: "A", waiverPosition: 1, value: 1 });
    expect(team0.lineupImpact.impact).toBeCloseTo(1, 6);
    expect(team0.likelyCompeting).toBe(false);
    expect(team0.reasons.map((r) => r.code)).toContain("TEAM_NEED_UNLIKELY");
  });

  it("boundary: impact exactly equal to the threshold is not flagged (strict >)", () => {
    const team0 = runSingleTeam({
      teamId: "A",
      waiverPosition: 1,
      value: DEFAULT_COMPETING_NEED_THRESHOLD,
    });
    expect(team0.lineupImpact.impact).toBeCloseTo(DEFAULT_COMPETING_NEED_THRESHOLD, 6);
    expect(team0.likelyCompeting).toBe(false);
  });

  it("a team not ahead of me is never flagged, even with a high impact", () => {
    const team0 = runSingleTeam(
      { teamId: "A", waiverPosition: 9, value: 50 },
      { myWaiverPosition: 5 },
    );
    expect(team0.aheadOfMe).toBe(false);
    expect(team0.likelyCompeting).toBe(false);
    expect(team0.reasons.map((r) => r.code)).toContain("NOT_AHEAD_OF_ME");
  });

  it("without failed-claim history, no PRIOR_FAILED_CLAIM_SAME_POSITION reason appears", () => {
    const team0 = runSingleTeam({ teamId: "A", waiverPosition: 1, value: 10 });
    expect(team0.reasons.map((r) => r.code)).not.toContain("PRIOR_FAILED_CLAIM_SAME_POSITION");
  });

  it("with matching failed-claim history, adds the reason without changing the threshold outcome", () => {
    const history: FailedClaimRecord[] = [{ teamId: "A", position: "RB", week: 2 }];
    const team0 = runSingleTeam(
      { teamId: "A", waiverPosition: 1, value: 1 },
      { failedClaimHistory: history },
    );
    expect(team0.reasons.map((r) => r.code)).toContain("PRIOR_FAILED_CLAIM_SAME_POSITION");
    // Still not flagged: the history signal does not change the Lineup-Impact-based threshold math.
    expect(team0.likelyCompeting).toBe(false);
  });

  it("failed-claim history at a different position does not match", () => {
    const history: FailedClaimRecord[] = [{ teamId: "A", position: "WR", week: 2 }];
    const team0 = runSingleTeam(
      { teamId: "A", waiverPosition: 1, value: 10 },
      { failedClaimHistory: history },
    );
    expect(team0.reasons.map((r) => r.code)).not.toContain("PRIOR_FAILED_CLAIM_SAME_POSITION");
  });
});

describe("computeClaimAdvice (WAIVER-6c)", () => {
  function lineupImpactInput(candidateValue: number): LineupImpactInput {
    return {
      rosterPositions: ["RB"],
      roster: [],
      candidate: {
        playerId: "cand",
        fantasyPositions: ["RB"],
        weeklyValues: { 1: candidateValue },
      },
      weeks: [1],
    };
  }

  it("recommends claiming when impact clearly exceeds the value of priority", () => {
    // myWaiverPosition=1 -> positionFactor=1; weeksRemaining=seasonWeeks -> weeksFactor=1.
    // valueOfPriority = 6 * 1 * 1 = 6. impact = 10 > 6 -> worth it.
    const result = computeClaimAdvice({
      lineupImpactInput: lineupImpactInput(10),
      myWaiverPosition: 1,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
    });
    expect(result.valueOfPriority).toBeCloseTo(DEFAULT_PRIORITY_BASE_VALUE, 6);
    expect(result.lineupImpact.impact).toBeCloseTo(10, 6);
    expect(result.worthIt).toBe(true);
    expect(result.reasons.map((r) => r.code)).toContain("CLAIM_WORTH_IT");
  });

  it("recommends holding when impact is clearly below the value of priority", () => {
    const result = computeClaimAdvice({
      lineupImpactInput: lineupImpactInput(2),
      myWaiverPosition: 1,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
    });
    expect(result.worthIt).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain("CLAIM_NOT_WORTH_IT");
  });

  it("boundary: impact exactly equal to the value of priority is not worth it (strict >)", () => {
    const result = computeClaimAdvice({
      lineupImpactInput: lineupImpactInput(DEFAULT_PRIORITY_BASE_VALUE),
      myWaiverPosition: 1,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
    });
    expect(result.lineupImpact.impact).toBeCloseTo(result.valueOfPriority, 6);
    expect(result.worthIt).toBe(false);
  });

  it("hand-computed: far back in the order and fewer weeks remaining shrinks the value of priority", () => {
    // myWaiverPosition=11 -> 10 slots back -> positionFactor = 1 - 0.05*10 = 0.5
    // weeksRemaining=9 of 18 -> weeksFactor = 9/18 = 0.5
    // valueOfPriority = 6 * 0.5 * 0.5 = 1.5
    const result = computeClaimAdvice({
      lineupImpactInput: lineupImpactInput(5),
      myWaiverPosition: 11,
      weeksRemaining: 9,
    });
    expect(result.positionFactor).toBeCloseTo(0.5, 6);
    expect(result.weeksFactor).toBeCloseTo(0.5, 6);
    expect(result.valueOfPriority).toBeCloseTo(1.5, 6);
    expect(result.worthIt).toBe(true); // impact 5 > 1.5
  });

  it("position factor never drops below the configured floor even very far back", () => {
    const result = computeClaimAdvice({
      lineupImpactInput: lineupImpactInput(0),
      myWaiverPosition: 1000,
      weeksRemaining: DEFAULT_SEASON_WEEKS,
      minPositionFactor: DEFAULT_PRIORITY_MIN_POSITION_FACTOR,
      positionDecayPerSlot: DEFAULT_PRIORITY_POSITION_DECAY_PER_SLOT,
    });
    expect(result.positionFactor).toBeCloseTo(DEFAULT_PRIORITY_MIN_POSITION_FACTOR, 6);
  });
});

describe("computeNextWaiverClear and timing (WAIVER-6d)", () => {
  it("weekly, EST: now before this week's Monday 3am ET clear returns today's run", () => {
    // 2026-01-05 is a Monday. now = 06:30Z; ET (UTC-5) = 01:30, before 03:00 ET.
    // Expect the clear to land later the same day: 2026-01-05T08:00:00Z (03:00 ET + 5h).
    const result = computeNextWaiverClear({
      now: new Date("2026-01-05T06:30:00.000Z"),
      waiverDayOfWeek: 0, // Monday
      etUtcOffsetHours: -5,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });

  it("weekly, EST: now after this week's Monday 3am ET clear rolls to next Monday", () => {
    // Same Monday, now = 09:00Z; ET = 04:00, after 03:00 ET -> next clear is the following Monday.
    const result = computeNextWaiverClear({
      now: new Date("2026-01-05T09:00:00.000Z"),
      waiverDayOfWeek: 0,
      etUtcOffsetHours: -5,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-01-12T08:00:00.000Z");
  });

  it("weekly, EST: a Tuesday also rolls forward to the following Monday", () => {
    const result = computeNextWaiverClear({
      now: new Date("2026-01-06T07:30:00.000Z"),
      waiverDayOfWeek: 0,
      etUtcOffsetHours: -5,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-01-12T08:00:00.000Z");
  });

  it("daily waivers, EDT: now before today's 3am ET clear returns today's run", () => {
    // now=06:00Z; ET (UTC-4) = 02:00, before 03:00 ET -> clear later today.
    const result = computeNextWaiverClear({
      now: new Date("2026-06-01T06:00:00.000Z"),
      waiverDayOfWeek: 2, // ignored because dailyWaivers is true
      dailyWaivers: true,
      etUtcOffsetHours: -4,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-06-01T07:00:00.000Z");
    expect(result.reasons.map((r) => r.code)).not.toContain("WAIVER_DAY_UNKNOWN_ASSUMED_DAILY");
  });

  it("daily waivers, EDT: now after today's 3am ET clear rolls to tomorrow", () => {
    const result = computeNextWaiverClear({
      now: new Date("2026-06-01T10:00:00.000Z"),
      waiverDayOfWeek: 2,
      dailyWaivers: true,
      etUtcOffsetHours: -4,
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-06-02T07:00:00.000Z");
  });

  it("treats a null waiverDayOfWeek as daily and reports WAIVER_DAY_UNKNOWN_ASSUMED_DAILY", () => {
    const result = computeNextWaiverClear({
      now: new Date("2026-06-01T06:00:00.000Z"),
      waiverDayOfWeek: null,
      etUtcOffsetHours: -4,
    });
    expect(result.reasons.map((r) => r.code)).toContain("WAIVER_DAY_UNKNOWN_ASSUMED_DAILY");
  });
});

describe("computeFreeAgentTime (WAIVER-6d)", () => {
  it("adds waiverClearDays days to the drop time", () => {
    const result = computeFreeAgentTime({
      droppedAt: new Date("2026-01-05T12:00:00.000Z"),
      waiverClearDays: 2,
    });
    expect(result.freeAgentAt.toISOString()).toBe("2026-01-07T12:00:00.000Z");
    expect(result.reasons.map((r) => r.code)).toContain("FREE_AGENT_TIME");
  });

  it("treats a null waiverClearDays as immediate availability with a reason", () => {
    const droppedAt = new Date("2026-01-05T12:00:00.000Z");
    const result = computeFreeAgentTime({ droppedAt, waiverClearDays: null });
    expect(result.freeAgentAt.toISOString()).toBe(droppedAt.toISOString());
    expect(result.reasons.map((r) => r.code)).toContain(
      "WAIVER_CLEAR_DAYS_UNKNOWN_ASSUMED_IMMEDIATE",
    );
  });
});

describe("computeWaiverTiming (WAIVER-6d convenience wrapper)", () => {
  it("returns both the next clear and a specific player's free-agent time when droppedAt is given", () => {
    const result = computeWaiverTiming({
      now: new Date("2026-01-05T06:30:00.000Z"),
      waiverDayOfWeek: 0,
      waiverClearDays: 2,
      etUtcOffsetHours: -5,
      droppedAt: new Date("2026-01-04T00:00:00.000Z"),
    });
    expect(result.nextClearAt.toISOString()).toBe("2026-01-05T08:00:00.000Z");
    expect(result.freeAgentAt?.toISOString()).toBe("2026-01-06T00:00:00.000Z");
    expect(result.reasons.map((r) => r.code)).toContain("WAIVER_CLEAR_SCHEDULE");
    expect(result.reasons.map((r) => r.code)).toContain("FREE_AGENT_TIME");
  });

  it("omits freeAgentAt when droppedAt is not supplied", () => {
    const result = computeWaiverTiming({
      now: new Date("2026-01-05T06:30:00.000Z"),
      waiverDayOfWeek: 0,
      waiverClearDays: 2,
      etUtcOffsetHours: -5,
    });
    expect(result.freeAgentAt).toBeNull();
  });
});
