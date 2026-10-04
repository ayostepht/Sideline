import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayoffOddsSection } from "./playoff-odds";

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

describe("PlayoffOddsSection / null playoffTeams", () => {
  it("renders an explanatory panel, not blank space, when every team's odds are null", () => {
    const html = renderToStaticMarkup(
      <PlayoffOddsSection teams={[team({}), team({ rosterId: 2 })]} playoffTeams={null} />,
    );
    expect(html).toContain('data-testid="playoff-odds-unavailable"');
    expect(html).toContain("available yet");
    expect(html).not.toContain('data-testid="playoff-odds-list"');
  });
});

describe("PlayoffOddsSection / with odds", () => {
  const withOdds = (overrides: Partial<LeagueIntelligenceTeam> = {}) =>
    team({
      playoffOdds: {
        playoffPct: 0.72,
        byePct: null,
        seedDistribution: [
          { seed: 1, probability: 0.4 },
          { seed: 2, probability: 0.32 },
        ],
        reasons: [],
      },
      ...overrides,
    });

  it("shows each team's playoff percentage, sorted highest first", () => {
    const teams = [
      withOdds({
        rosterId: 1,
        teamName: "Long Shot",
        playoffOdds: { playoffPct: 0.1, byePct: null, seedDistribution: [], reasons: [] },
      }),
      withOdds({
        rosterId: 2,
        teamName: "Favorite",
        playoffOdds: { playoffPct: 0.95, byePct: null, seedDistribution: [], reasons: [] },
      }),
    ];
    const html = renderToStaticMarkup(<PlayoffOddsSection teams={teams} playoffTeams={6} />);
    expect(html.indexOf("Favorite")).toBeLessThan(html.indexOf("Long Shot"));
    expect(html).toContain("95%");
    expect(html).toContain("10%");
  });

  it("shows a seed-chance detail for teams with a seed distribution", () => {
    const html = renderToStaticMarkup(<PlayoffOddsSection teams={[withOdds()]} playoffTeams={6} />);
    expect(html).toContain("Seed chances");
    expect(html).toContain('data-testid="playoff-odds-seeds"');
    expect(html).toContain("40%");
  });

  it("shows a denser table at lg and up alongside the mobile card list (T6.3c)", () => {
    const html = renderToStaticMarkup(<PlayoffOddsSection teams={[withOdds()]} playoffTeams={6} />);
    expect(html).toContain('data-testid="playoff-odds-table"');
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:block");
  });

  it("marks the viewer's own team with a You badge in both the card and table rows (T6.3c)", () => {
    const teams = [
      withOdds({ rosterId: 1, teamName: "Mine" }),
      withOdds({ rosterId: 2, teamName: "Other" }),
    ];
    const html = renderToStaticMarkup(
      <PlayoffOddsSection teams={teams} playoffTeams={6} myRosterId={1} />,
    );
    const occurrences = html.split('data-testid="playoff-odds-you"').length - 1;
    expect(occurrences).toBe(2);
    const mineOccurrences = html.split('data-mine="true"').length - 1;
    expect(mineOccurrences).toBe(2);
  });

  it("marks no team when myRosterId is omitted", () => {
    const html = renderToStaticMarkup(<PlayoffOddsSection teams={[withOdds()]} playoffTeams={6} />);
    expect(html).not.toContain('data-testid="playoff-odds-you"');
    expect(html).not.toContain('data-mine="true"');
  });

  it("shows the season-level reasons once, not per team", () => {
    const teams = [
      withOdds({
        rosterId: 1,
        playoffOdds: {
          playoffPct: 0.5,
          byePct: null,
          seedDistribution: [],
          reasons: [
            { code: "LEAGUE_PLAYOFF_ODDS_NO_REMAINING_GAMES", label: "No games left to simulate" },
          ],
        },
      }),
      withOdds({
        rosterId: 2,
        playoffOdds: {
          playoffPct: 0.6,
          byePct: null,
          seedDistribution: [],
          reasons: [
            { code: "LEAGUE_PLAYOFF_ODDS_NO_REMAINING_GAMES", label: "No games left to simulate" },
          ],
        },
      }),
    ];
    const html = renderToStaticMarkup(<PlayoffOddsSection teams={teams} playoffTeams={6} />);
    const occurrences = html.split("No games left to simulate").length - 1;
    expect(occurrences).toBe(1);
  });
});
