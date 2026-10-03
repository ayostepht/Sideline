import type { LineupPlayer, Reason, StandingsRow, TeamPlayerRow } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  displayName,
  formatPoints,
  formatRecord,
  groupPlayers,
  lineupIssueLabel,
  selectStandingsSnippet,
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
});
