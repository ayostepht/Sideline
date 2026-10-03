import type {
  LineupPlayer,
  PlayerDetailResponse,
  Reason,
  StandingsRow,
  TeamPlayerRow,
  WaiverCandidate,
} from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  displayName,
  formatPoints,
  formatRecord,
  formatSignedPoints,
  groupPlayers,
  lineupIssueLabel,
  risingFreeAgents,
  risingRosterPlayers,
  selectRisers,
  selectStandingsSnippet,
  topWaiverTargets,
} from "./format";

const row = (rank: number, isMine = false): StandingsRow => ({
  rosterId: rank,
  ownerId: null,
  teamName: `T${rank}`,
  managerName: null,
  avatar: null,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  rank,
  division: null,
  isMine,
});

const player = (over: Partial<TeamPlayerRow>): TeamPlayerRow => ({
  playerId: "1",
  name: "A",
  position: "RB",
  fantasyPositions: ["RB"],
  nflTeam: "KC",
  status: null,
  injuryStatus: null,
  injuryBodyPart: null,
  byeWeek: null,
  slot: "starter",
  starterSlot: "RB",
  ...over,
});

describe("format", () => {
  it("formats records and points", () => {
    expect(formatRecord({ wins: 7, losses: 3, ties: 0 })).toBe("7-3");
    expect(formatRecord({ wins: 7, losses: 2, ties: 1 })).toBe("7-2-1");
    expect(formatPoints(1234.5)).toBe("1,234.5");
    expect(formatPoints(0)).toBe("0.0");
  });

  it("selects top 4 plus mine when outside", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((r) => row(r, r === 6));
    expect(selectStandingsSnippet(rows).map((r) => r.rank)).toEqual([1, 2, 3, 4, 6]);
    const inTop = [1, 2, 3, 4, 5, 6].map((r) => row(r, r === 2));
    expect(selectStandingsSnippet(inTop).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(selectStandingsSnippet([row(1)])).toHaveLength(1);
    expect(selectStandingsSnippet([])).toEqual([]);
  });

  it("groups players and names unknowns", () => {
    const g = groupPlayers([
      player({}),
      player({ slot: "ir", starterSlot: null }),
      player({ slot: "taxi", starterSlot: null }),
    ]);
    expect([g.starters.length, g.bench.length, g.ir.length, g.taxi.length]).toEqual([1, 0, 1, 1]);
    expect(displayName({ name: "", playerId: "99" })).toBe("Player 99");
    expect(displayName({ name: "Ann", playerId: "99" })).toBe("Ann");
  });

  it("builds plain-language lineup issue copy", () => {
    const lineupPlayer = (over: Partial<LineupPlayer>): LineupPlayer => ({
      playerId: "42",
      name: "Jo Doe",
      position: "RB",
      nflTeam: "KC",
      status: null,
      injuryStatus: null,
      byeWeek: null,
      value: 0,
      matchupGrade: null,
      matchupLabel: null,
      locked: false,
      kickoffApproximate: false,
      reasons: [],
      ...over,
    });
    const byeReason: Reason = { code: "UNAVAILABLE", label: "On bye this week", impact: -10 };
    const players: LineupPlayer[] = [lineupPlayer({ reasons: [byeReason] })];

    expect(
      lineupIssueLabel(
        {
          code: "INACTIVE_STARTER",
          label: "Currently started player 42 is unavailable",
          value: "42",
        },
        players,
      ),
    ).toBe("Jo Doe: On bye this week");

    expect(
      lineupIssueLabel(
        {
          code: "INACTIVE_STARTER",
          label: "Currently started player 99 is unavailable",
          value: "99",
        },
        players,
      ),
    ).toBe("Currently started player 99 is unavailable");

    expect(
      lineupIssueLabel(
        { code: "EMPTY_SLOT", label: "No eligible player available for RB", value: "RB" },
        players,
      ),
    ).toBe("No eligible player available for RB");

    const noReasonPlayers: LineupPlayer[] = [lineupPlayer({})];
    expect(
      lineupIssueLabel(
        {
          code: "INACTIVE_STARTER",
          label: "Currently started player 42 is unavailable",
          value: "42",
        },
        noReasonPlayers,
      ),
    ).toBe("Jo Doe is unavailable");
  });

  it("formats signed points", () => {
    expect(formatSignedPoints(3.4)).toBe("+3.4 pts");
    expect(formatSignedPoints(-1.25)).toBe("-1.3 pts");
    expect(formatSignedPoints(0)).toBe("+0.0 pts");
  });

  const candidate = (over: Partial<WaiverCandidate>): WaiverCandidate => ({
    playerId: "10",
    name: "Cand One",
    position: "WR",
    fantasyPositions: ["WR"],
    nflTeam: "SF",
    status: null,
    injuryStatus: null,
    lineupImpact: 1,
    rosValue: 1,
    waiverScore: 50,
    trendSignal: "Steady",
    momentumLabel: "Neutral",
    suggestedDropPlayerId: null,
    reasons: [],
    ...over,
  });

  it("takes the top N waiver targets, preserving forMyTeam's order", () => {
    const candidates = [
      candidate({ playerId: "1" }),
      candidate({ playerId: "2" }),
      candidate({ playerId: "3" }),
      candidate({ playerId: "4" }),
    ];
    expect(topWaiverTargets(candidates).map((c) => c.playerId)).toEqual(["1", "2", "3"]);
    expect(topWaiverTargets(candidates, 2).map((c) => c.playerId)).toEqual(["1", "2"]);
    expect(topWaiverTargets([])).toEqual([]);
  });

  it("drops candidates whose Lineup Impact is zero or negative (never presented as a recommendation)", () => {
    // All-negative (and zero): every candidate would make the lineup worse, or do nothing.
    const allNonPositive = [
      candidate({ playerId: "1", lineupImpact: -2 }),
      candidate({ playerId: "2", lineupImpact: 0 }),
      candidate({ playerId: "3", lineupImpact: -0.5 }),
    ];
    expect(topWaiverTargets(allNonPositive)).toEqual([]);

    // All-positive: every candidate is kept, in order, up to the limit.
    const allPositive = [
      candidate({ playerId: "1", lineupImpact: 5 }),
      candidate({ playerId: "2", lineupImpact: 3 }),
      candidate({ playerId: "3", lineupImpact: 1 }),
    ];
    expect(topWaiverTargets(allPositive).map((c) => c.playerId)).toEqual(["1", "2", "3"]);

    // Mixed: only the positive candidates are shown, order preserved from forMyTeam's existing
    // Lineup-Impact-descending sort.
    const mixed = [
      candidate({ playerId: "1", lineupImpact: 5 }),
      candidate({ playerId: "2", lineupImpact: -1 }),
      candidate({ playerId: "3", lineupImpact: 3 }),
      candidate({ playerId: "4", lineupImpact: -2 }),
      candidate({ playerId: "5", lineupImpact: 2 }),
    ];
    expect(topWaiverTargets(mixed).map((c) => c.playerId)).toEqual(["1", "3", "5"]);
  });

  const playerDetail = (over: Partial<PlayerDetailResponse>): PlayerDetailResponse => ({
    playerId: "20",
    name: "Roster Player",
    position: "RB",
    fantasyPositions: ["RB"],
    nflTeam: "KC",
    status: null,
    injuryStatus: null,
    scoring: {
      seasonPpg: null,
      l3Ppg: null,
      l3Delta: null,
      gamesPlayed: 0,
      weeklySeries: [],
      reasons: [],
    },
    usage: { fields: [], reasons: [] },
    consistency: { cv: 0, weeks: [], boomCount: 0, bustCount: 0, startableCount: 0, reasons: [] },
    signal: null,
    signalReasons: [],
    momentum: { addCount: 0, dropCount: 0, netCount: 0, label: "Neutral", reasons: [] },
    freshness: { updatedAt: null, stale: false },
    ...over,
  });

  it("filters roster players and free agents to Rising only", () => {
    const details = [
      playerDetail({ playerId: "1", signal: "Rising" }),
      playerDetail({ playerId: "2", signal: "Falling" }),
      playerDetail({ playerId: "3", signal: null }),
    ];
    expect(risingRosterPlayers(details)).toEqual([
      { playerId: "1", name: "Roster Player", position: "RB", source: "roster" },
    ]);

    const candidates = [
      candidate({ playerId: "10", trendSignal: "Rising" }),
      candidate({ playerId: "11", trendSignal: "Steady" }),
    ];
    expect(risingFreeAgents(candidates)).toEqual([
      { playerId: "10", name: "Cand One", position: "WR", source: "freeAgent" },
    ]);
  });

  it("combines risers, roster first, capped to the limit", () => {
    const roster = [
      { playerId: "1", name: "A", position: "RB", source: "roster" as const },
      { playerId: "2", name: "B", position: "WR", source: "roster" as const },
    ];
    const freeAgents = [
      { playerId: "3", name: "C", position: "TE", source: "freeAgent" as const },
      { playerId: "4", name: "D", position: "QB", source: "freeAgent" as const },
    ];
    expect(selectRisers(roster, freeAgents, 3).map((r) => r.playerId)).toEqual(["1", "2", "3"]);
    expect(selectRisers([], [])).toEqual([]);
  });
});
