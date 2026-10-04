import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllPlayLuckList } from "./all-play-luck";

function team(overrides: Partial<LeagueIntelligenceTeam>): LeagueIntelligenceTeam {
  return {
    rosterId: 1,
    teamName: "Team One",
    allPlay: {
      wins: 5,
      losses: 3,
      ties: 0,
      gamesPlayed: 8,
      winRate: 0.625,
      weeklyWinRates: [0.5, 0.6],
      reasons: [],
    },
    luck: { actualWins: 5, expectedWins: 4, luck: 1, reasons: [] },
    powerScore: {
      score: 0.5,
      allPlayWinRate: 0.5,
      recentPointsForNormalized: 0.5,
      rosterStrengthNormalized: 0.5,
      reasons: [],
    },
    playoffOdds: null,
    managerTendencies: {
      transactionCount: 0,
      waiverClaimsWon: 0,
      tradeCount: 0,
      faabSpent: null,
      faabRemaining: null,
      faabAverageWinningBid: null,
      faabMaxWinningBid: null,
      reasons: [],
    },
    ...overrides,
  };
}

describe("AllPlayLuckList", () => {
  it("shows the all-play record, win rate and luck for each team", () => {
    const html = renderToStaticMarkup(<AllPlayLuckList teams={[team({})]} />);
    expect(html).toContain("5-3");
    expect(html).toContain("63%");
    expect(html).toContain("+1.0 luck");
  });

  it("sorts by all-play win rate descending", () => {
    const teams = [
      team({
        rosterId: 1,
        teamName: "Low Win Rate",
        allPlay: {
          wins: 2,
          losses: 6,
          ties: 0,
          gamesPlayed: 8,
          winRate: 0.25,
          weeklyWinRates: [],
          reasons: [],
        },
      }),
      team({
        rosterId: 2,
        teamName: "High Win Rate",
        allPlay: {
          wins: 7,
          losses: 1,
          ties: 0,
          gamesPlayed: 8,
          winRate: 0.875,
          weeklyWinRates: [],
          reasons: [],
        },
      }),
    ];
    const html = renderToStaticMarkup(<AllPlayLuckList teams={teams} />);
    expect(html.indexOf("High Win Rate")).toBeLessThan(html.indexOf("Low Win Rate"));
  });

  it("shows negative luck with a down direction and the word Unlucky for screen readers", () => {
    const teams = [team({ luck: { actualWins: 2, expectedWins: 4, luck: -2, reasons: [] } })];
    const html = renderToStaticMarkup(<AllPlayLuckList teams={teams} />);
    expect(html).toContain("-2.0 luck");
    expect(html).toContain("Unlucky");
    expect(html).toContain("text-negative");
  });

  it("shows a denser table at lg and up alongside the mobile card list (T6.3c)", () => {
    const html = renderToStaticMarkup(<AllPlayLuckList teams={[team({})]} />);
    expect(html).toContain('data-testid="all-play-luck-table"');
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:block");
  });

  it("marks the viewer's own team with a You badge in both the card and table rows (T6.3c)", () => {
    const teams = [
      team({ rosterId: 1, teamName: "Mine" }),
      team({ rosterId: 2, teamName: "Other" }),
    ];
    const html = renderToStaticMarkup(<AllPlayLuckList teams={teams} myRosterId={1} />);
    const occurrences = html.split('data-testid="all-play-luck-you"').length - 1;
    expect(occurrences).toBe(2);
    const mineOccurrences = html.split('data-mine="true"').length - 1;
    expect(mineOccurrences).toBe(2);
  });

  it("marks no team when myRosterId is omitted", () => {
    const html = renderToStaticMarkup(<AllPlayLuckList teams={[team({})]} />);
    expect(html).not.toContain('data-testid="all-play-luck-you"');
    expect(html).not.toContain('data-mine="true"');
  });
});
