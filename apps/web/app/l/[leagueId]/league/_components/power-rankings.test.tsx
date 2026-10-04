import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PowerRankingsList } from "./power-rankings";

function team(overrides: Partial<LeagueIntelligenceTeam>): LeagueIntelligenceTeam {
  return {
    rosterId: 1,
    teamName: "Team One",
    allPlay: {
      wins: 0,
      losses: 0,
      ties: 0,
      gamesPlayed: 0,
      winRate: 0,
      weeklyWinRates: [],
      reasons: [],
    },
    luck: { actualWins: 0, expectedWins: 0, luck: 0, reasons: [] },
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

describe("PowerRankingsList", () => {
  it("sorts teams by power score descending", () => {
    const teams = [
      team({
        rosterId: 1,
        teamName: "Low Score",
        powerScore: {
          score: 0.3,
          allPlayWinRate: 0.3,
          recentPointsForNormalized: 0.3,
          rosterStrengthNormalized: 0.3,
          reasons: [],
        },
      }),
      team({
        rosterId: 2,
        teamName: "High Score",
        powerScore: {
          score: 0.9,
          allPlayWinRate: 0.9,
          recentPointsForNormalized: 0.9,
          rosterStrengthNormalized: 0.9,
          reasons: [],
        },
      }),
    ];
    const html = renderToStaticMarkup(<PowerRankingsList teams={teams} />);
    expect(html.indexOf("High Score")).toBeLessThan(html.indexOf("Low Score"));
    expect(html).toContain("90.0");
    expect(html).toContain("30.0");
  });

  it("shows the composite weights as plain-language copy", () => {
    const html = renderToStaticMarkup(<PowerRankingsList teams={[team({})]} />);
    expect(html).toContain("40%");
    expect(html).toContain("30%");
  });

  it("includes a Why trigger for each row's reasons", () => {
    const teams = [
      team({
        powerScore: {
          score: 0.5,
          allPlayWinRate: 0.5,
          recentPointsForNormalized: 0.5,
          rosterStrengthNormalized: 0.5,
          reasons: [
            {
              code: "LEAGUE_POWER_SCORE_ALL_PLAY",
              label: "All-play win rate contribution",
              value: 0.2,
            },
          ],
        },
      }),
    ];
    const html = renderToStaticMarkup(<PowerRankingsList teams={teams} />);
    expect(html).toContain('data-testid="why-trigger"');
  });

  it("shows a denser table at lg and up alongside the mobile card list (T6.3c)", () => {
    const html = renderToStaticMarkup(<PowerRankingsList teams={[team({})]} />);
    expect(html).toContain('data-testid="power-rankings-table"');
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:block");
  });

  it("marks the viewer's own team with a You badge in both the card and table rows (T6.3c)", () => {
    const teams = [
      team({ rosterId: 1, teamName: "Mine" }),
      team({ rosterId: 2, teamName: "Other" }),
    ];
    const html = renderToStaticMarkup(<PowerRankingsList teams={teams} myRosterId={1} />);
    const occurrences = html.split('data-testid="power-rankings-you"').length - 1;
    expect(occurrences).toBe(2);
    const mineOccurrences = html.split('data-mine="true"').length - 1;
    expect(mineOccurrences).toBe(2);
  });

  it("marks no team when myRosterId is omitted", () => {
    const html = renderToStaticMarkup(<PowerRankingsList teams={[team({})]} />);
    expect(html).not.toContain('data-testid="power-rankings-you"');
    expect(html).not.toContain('data-mine="true"');
  });
});
