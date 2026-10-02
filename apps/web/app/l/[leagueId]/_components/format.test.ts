import type { StandingsRow, TeamPlayerRow } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  countStarterIssues,
  displayName,
  formatPoints,
  formatRecord,
  groupPlayers,
  issuesText,
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

  it("counts starters who are out, IR or on bye", () => {
    const ps = [
      player({ injuryStatus: "Out" }),
      player({ injuryStatus: "IR" }),
      player({ byeWeek: 5 }),
      player({ injuryStatus: "Questionable" }),
      player({ injuryStatus: "Out", slot: "bench", starterSlot: null }),
      player({ byeWeek: 5, injuryStatus: "Out" }),
    ];
    expect(countStarterIssues(ps, 5)).toBe(4);
    expect(countStarterIssues(ps, null)).toBe(3);
    expect(countStarterIssues([], 5)).toBe(0);
  });

  it("words the issues text", () => {
    expect(issuesText(0)).toBe("No lineup issues this week");
    expect(issuesText(1)).toBe("1 starter needs attention");
    expect(issuesText(3)).toBe("3 starters need attention");
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
});
