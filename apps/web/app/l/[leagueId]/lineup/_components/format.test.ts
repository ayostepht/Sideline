import type { LineupPlayer, LineupSwap, StandingsRow } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  buildLineupHref,
  formatSignedPoints,
  formatValue,
  hasMaterialSwaps,
  isMineRoster,
  lineupSummary,
  parseMode,
  parseRosterId,
  playerById,
  rosterExists,
  swapDelta,
  teamNameFor,
} from "./format";

function player(id: string, value: number): LineupPlayer {
  return {
    playerId: id,
    name: `Player ${id}`,
    position: "RB",
    nflTeam: "KC",
    status: null,
    injuryStatus: null,
    byeWeek: null,
    value,
    matchupGrade: null,
    matchupLabel: null,
    locked: false,
    kickoffApproximate: false,
    reasons: [],
  };
}

function swap(playerIdIn: string | null, playerIdOut: string | null): LineupSwap {
  return { slotIndex: 0, slotType: "FLEX", playerIdIn, playerIdOut };
}

function row(rosterId: number, teamName: string, isMine: boolean): StandingsRow {
  return {
    rosterId,
    ownerId: null,
    teamName,
    managerName: null,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    rank: 1,
    division: null,
    isMine,
  };
}

describe("parseMode", () => {
  it("accepts known modes", () => {
    expect(parseMode("safe")).toBe("safe");
    expect(parseMode("upside")).toBe("upside");
    expect(parseMode("projected")).toBe("projected");
    expect(parseMode("auto")).toBe("auto");
  });
  it("falls back to projected for missing or invalid values", () => {
    expect(parseMode(undefined)).toBe("auto");
    expect(parseMode(null)).toBe("auto");
    expect(parseMode("")).toBe("auto");
    expect(parseMode("bogus")).toBe("auto");
  });
  it("takes the first of a repeated param", () => {
    expect(parseMode(["safe", "upside"])).toBe("safe");
  });
});

describe("parseRosterId", () => {
  it("parses a positive integer string", () => {
    expect(parseRosterId("3")).toBe(3);
  });
  it("rejects zero, negative, non-numeric, and missing values", () => {
    expect(parseRosterId("0")).toBeUndefined();
    expect(parseRosterId("-1")).toBeUndefined();
    expect(parseRosterId("abc")).toBeUndefined();
    expect(parseRosterId(undefined)).toBeUndefined();
    expect(parseRosterId(null)).toBeUndefined();
  });
});

describe("formatValue", () => {
  it("formats with one decimal", () => {
    expect(formatValue(14)).toBe("14.0");
    expect(formatValue(14.26)).toBe("14.3");
  });
});

describe("formatSignedPoints", () => {
  it("always shows a sign", () => {
    expect(formatSignedPoints(3.44)).toBe("+3.4 pts");
    expect(formatSignedPoints(-1.2)).toBe("-1.2 pts");
    expect(formatSignedPoints(0)).toBe("+0.0 pts");
  });
});

describe("playerById", () => {
  const players = [player("1", 10), player("2", 5)];
  it("finds a player by id", () => {
    expect(playerById(players, "2")?.value).toBe(5);
  });
  it("returns null for a null id or unknown id", () => {
    expect(playerById(players, null)).toBeNull();
    expect(playerById(players, "9")).toBeNull();
  });
});

describe("swapDelta", () => {
  const players = [player("in", 12), player("out", 7)];
  it("computes optimal-in minus current-out", () => {
    expect(swapDelta(players, swap("in", "out"))).toBeCloseTo(5);
  });
  it("treats an intentionally empty side as 0, not a gap", () => {
    expect(swapDelta(players, swap("in", null))).toBeCloseTo(12);
    expect(swapDelta(players, swap(null, "out"))).toBeCloseTo(-7);
  });
  it("returns null when a named player id is missing from players (a real data gap)", () => {
    expect(swapDelta(players, swap("missing", "out"))).toBeNull();
    expect(swapDelta(players, swap("in", "missing"))).toBeNull();
  });
});

describe("hasMaterialSwaps", () => {
  it("is false with no swaps regardless of delta", () => {
    expect(hasMaterialSwaps(0, 0)).toBe(false);
    expect(hasMaterialSwaps(3.4, 0)).toBe(false);
  });
  it("is false below the 0.05pt floor even with swaps present", () => {
    expect(hasMaterialSwaps(0, 3)).toBe(false);
    expect(hasMaterialSwaps(0.02, 3)).toBe(false);
  });
  it("is true at or above the floor with at least one swap", () => {
    expect(hasMaterialSwaps(0.05, 1)).toBe(true);
    expect(hasMaterialSwaps(3.4, 2)).toBe(true);
  });
});

describe("lineupSummary", () => {
  it("reports already optimal when there are no swaps", () => {
    expect(lineupSummary(0, 0)).toBe("Your lineup is already optimal");
  });
  it("pluralizes and signs the delta", () => {
    expect(lineupSummary(3.4, 1)).toBe("1 swap available, projected +3.4 pts");
    expect(lineupSummary(3.4, 2)).toBe("2 swaps available, projected +3.4 pts");
  });
  it("reports already optimal below the materiality floor even with swaps present", () => {
    expect(lineupSummary(0, 3)).toBe("Your lineup is already optimal");
    expect(lineupSummary(0.02, 3)).toBe("Your lineup is already optimal");
  });
  it("still reports swaps right at the floor", () => {
    expect(lineupSummary(0.05, 1)).toBe("1 swap available, projected +0.1 pts");
  });
});

describe("buildLineupHref", () => {
  it("omits mode when auto", () => {
    expect(buildLineupHref("abc", { week: 5, mode: "auto" })).toBe("/l/abc/lineup?week=5");
  });
  it("includes week and mode, omits roster when unset", () => {
    expect(buildLineupHref("abc", { week: 5, mode: "safe" })).toBe(
      "/l/abc/lineup?week=5&mode=safe",
    );
  });
  it("omits week when null and includes roster when set", () => {
    expect(buildLineupHref("abc", { week: null, mode: "projected", roster: 7 })).toBe(
      "/l/abc/lineup?mode=projected&roster=7",
    );
  });
});

describe("teamNameFor", () => {
  const rows = [row(1, "Alpha", true), row(2, "Beta", false)];
  it("finds a team name by roster id", () => {
    expect(teamNameFor(rows, 2)).toBe("Beta");
  });
  it("falls back to a generic label when the roster is unknown", () => {
    expect(teamNameFor(rows, 9)).toBe("Team 9");
  });
  it("falls back when standings are unavailable", () => {
    expect(teamNameFor([], 4)).toBe("Team 4");
  });
});

describe("isMineRoster", () => {
  const rows = [row(1, "Alpha", true), row(2, "Beta", false)];
  it("reports the stored user's roster", () => {
    expect(isMineRoster(rows, 1)).toBe(true);
    expect(isMineRoster(rows, 2)).toBe(false);
  });
  it("is false when the roster or standings are unavailable", () => {
    expect(isMineRoster(rows, 9)).toBe(false);
    expect(isMineRoster([], 1)).toBe(false);
  });
});

describe("rosterExists", () => {
  const rows = [row(1, "Alpha", true), row(2, "Beta", false)];
  it("is true for a roster id present in standings", () => {
    expect(rosterExists(rows, 1)).toBe(true);
    expect(rosterExists(rows, 2)).toBe(true);
  });
  it("is false for an unknown roster id or empty standings", () => {
    expect(rosterExists(rows, 9)).toBe(false);
    expect(rosterExists([], 1)).toBe(false);
  });
});
