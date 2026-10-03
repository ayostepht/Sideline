import type {
  ClaimAdvice,
  CompetingTeam,
  Reason,
  TeamPlayerRow,
  WaiverCandidate,
} from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  buildWaiversPageQuery,
  buildWaiversQuery,
  claimBadgeInfo,
  competingFlagReasons,
  dropPlayerMap,
  formatScore,
  formatSignedPoints,
  formatUntil,
  parsePositions,
  parseView,
  reasonValue,
  suggestedDropText,
  toTrend,
  topTargetSummary,
  VIEW_LABEL,
  WAIVER_POSITIONS,
} from "./format";

function candidate(over: Partial<WaiverCandidate> = {}): WaiverCandidate {
  return {
    playerId: "1",
    name: "Player One",
    position: "RB",
    fantasyPositions: ["RB"],
    nflTeam: "KC",
    status: null,
    injuryStatus: null,
    lineupImpact: 4.2,
    rosValue: 10,
    waiverScore: 72.4,
    trendSignal: "Rising",
    momentumLabel: "Hot",
    suggestedDropPlayerId: null,
    reasons: [],
    ...over,
  };
}

function teamPlayer(over: Partial<TeamPlayerRow> = {}): TeamPlayerRow {
  return {
    playerId: "9",
    name: "Bench Guy",
    position: "WR",
    fantasyPositions: ["WR"],
    nflTeam: "NYJ",
    status: null,
    injuryStatus: null,
    injuryBodyPart: null,
    byeWeek: null,
    slot: "bench",
    starterSlot: null,
    ...over,
  };
}

function competingTeam(over: Partial<CompetingTeam> = {}): CompetingTeam {
  return {
    rosterId: 2,
    teamName: "Team Two",
    waiverPosition: 1,
    aheadOfMe: true,
    lineupImpact: 5.1,
    likelyCompeting: true,
    reasons: [{ code: "TEAM_NEED_LIKELY", label: "Would add about 5.1 points to this lineup" }],
    ...over,
  };
}

function claimAdvice(over: Partial<ClaimAdvice> = {}): ClaimAdvice {
  return {
    worthIt: true,
    lineupImpact: 6,
    valueOfPriority: 3,
    positionFactor: 1,
    weeksFactor: 1,
    reasons: [],
    ...over,
  };
}

describe("waivers format", () => {
  it("parses view", () => {
    expect(parseView(undefined)).toBe("mine");
    expect(parseView("mine")).toBe("mine");
    expect(parseView("available")).toBe("available");
    expect(parseView("bogus")).toBe("mine");
    expect(parseView(["available", "mine"])).toBe("available");
  });

  it("has display labels for both views", () => {
    expect(VIEW_LABEL.mine).toBe("For my team");
    expect(VIEW_LABEL.available).toBe("Best available");
  });

  it("parses positions, keeping only known ones in canonical order", () => {
    expect(parsePositions(undefined)).toEqual([]);
    expect(parsePositions("")).toEqual([]);
    expect(parsePositions("rb,wr")).toEqual(["RB", "WR"]);
    expect(parsePositions("WR,RB,BOGUS")).toEqual(["RB", "WR"]);
    expect(parsePositions(["QB,TE"])).toEqual(["QB", "TE"]);
    expect(WAIVER_POSITIONS).toContain("DEF");
  });

  it("builds the API query string, omitting positions when empty", () => {
    expect(buildWaiversQuery(5, [])).toBe("week=5");
    expect(buildWaiversQuery(5, ["RB", "WR"])).toBe("week=5&positions=RB%2CWR");
  });

  it("builds the page query string, omitting defaults", () => {
    expect(buildWaiversPageQuery(5, "mine", [])).toBe("week=5");
    expect(buildWaiversPageQuery(5, "available", ["RB"])).toBe(
      "week=5&view=available&positions=RB",
    );
  });

  it("formats signed points and scores", () => {
    expect(formatSignedPoints(3.44)).toBe("+3.4 pts");
    expect(formatSignedPoints(-1.2)).toBe("-1.2 pts");
    expect(formatSignedPoints(0)).toBe("+0.0 pts");
    expect(formatScore(72.6)).toBe("73");
    expect(formatScore(0)).toBe("0");
  });

  it("maps the capitalized trend signal to the lowercase Trend key", () => {
    expect(toTrend("Rising")).toBe("rising");
    expect(toTrend("Steady")).toBe("steady");
    expect(toTrend("Falling")).toBe("falling");
  });

  it("reads a numeric reason value by code", () => {
    const reasons: Reason[] = [
      { code: "A", value: 10 },
      { code: "B", value: "x" },
    ] as Reason[];
    expect(reasonValue(reasons, "A")).toBe(10);
    expect(reasonValue(reasons, "B")).toBeUndefined();
    expect(reasonValue(reasons, "C")).toBeUndefined();
  });

  it("resolves a suggested drop to a name, or a fallback copy", () => {
    const drops = dropPlayerMap([teamPlayer({ playerId: "9", name: "Bench Guy" })]);
    expect(suggestedDropText(null, drops)).toBe("No drop needed");
    expect(suggestedDropText("9", drops)).toBe("Bench Guy");
    expect(suggestedDropText("missing", drops)).toBe("A roster player");
  });

  it("builds one reason per likely-competing team, skipping the rest", () => {
    const teams = [
      competingTeam({ rosterId: 2, teamName: "Team Two", likelyCompeting: true }),
      competingTeam({ rosterId: 3, teamName: "Team Three", likelyCompeting: false }),
    ];
    const reasons = competingFlagReasons(teams);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.code).toBe("COMPETING_TEAM_2");
    expect(reasons[0]?.label).toContain("5.1 points");
  });

  it("falls back to a generic label when a flagged team has no TEAM_NEED_LIKELY reason", () => {
    const reasons = competingFlagReasons([
      competingTeam({ teamName: "Team X", reasons: [], likelyCompeting: true }),
    ]);
    expect(reasons[0]?.label).toBe("Team X would likely also claim this player");
  });

  it("labels claim advice by worth-it-ness", () => {
    expect(claimBadgeInfo(claimAdvice({ worthIt: true }))).toEqual({
      label: "Worth claiming",
      variant: "positive",
    });
    expect(claimBadgeInfo(claimAdvice({ worthIt: false }))).toEqual({
      label: "Hold your spot",
      variant: "neutral",
    });
  });

  it("formats relative future time for the next waiver clear", () => {
    const now = Date.parse("2025-10-01T00:00:00.000Z");
    expect(formatUntil(null, now)).toBe("Unknown");
    expect(formatUntil("not a date", now)).toBe("Unknown");
    expect(formatUntil("2025-10-01T00:00:00.000Z", now)).toBe("any moment");
    expect(formatUntil("2025-10-01T00:30:00.000Z", now)).toBe("in 30 minutes");
    expect(formatUntil("2025-10-01T05:00:00.000Z", now)).toBe("in 5 hours");
    expect(formatUntil("2025-10-03T00:00:00.000Z", now)).toBe("in 2 days");
  });

  it("builds the top target summary, or null with nothing worth suggesting", () => {
    expect(topTargetSummary([])).toBeNull();
    expect(topTargetSummary([candidate({ lineupImpact: 0 })])).toBeNull();
    expect(topTargetSummary([candidate({ name: "Big Add", lineupImpact: 5.3 })])).toBe(
      "Top waiver target: Big Add, +5.3 pts over the next 3 weeks",
    );
  });
});
