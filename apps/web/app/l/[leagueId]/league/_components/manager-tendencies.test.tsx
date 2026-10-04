import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManagerTendenciesList } from "./manager-tendencies";

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
      transactionCount: 3,
      waiverClaimsWon: 1,
      tradeCount: 1,
      faabSpent: null,
      faabRemaining: null,
      faabAverageWinningBid: null,
      faabMaxWinningBid: null,
      reasons: [],
    },
    ...overrides,
  };
}

describe("ManagerTendenciesList / non-FAAB league", () => {
  it("shows a not-applicable note instead of FAAB figures, and no dollar amounts at all", () => {
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={[team({})]} />);
    expect(html).toContain("does not use FAAB");
    expect(html).not.toContain("FAAB spent");
    expect(html).not.toContain("$0");
  });

  it("still shows transaction, trade and waiver-claim counts", () => {
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={[team({})]} />);
    expect(html).toContain(">3<");
    expect(html).toContain(">1<");
  });
});

describe("ManagerTendenciesList / FAAB league", () => {
  it("distinguishes a team that spent $0 (real zero) from the non-FAAB null case", () => {
    const teams = [
      team({
        managerTendencies: {
          transactionCount: 2,
          waiverClaimsWon: 0,
          tradeCount: 0,
          faabSpent: 0,
          faabRemaining: 100,
          faabAverageWinningBid: 0,
          faabMaxWinningBid: 0,
          reasons: [
            {
              code: "LEAGUE_MANAGER_NO_WINNING_CLAIMS",
              label: "No winning waiver claims with a FAAB bid yet",
              value: 0,
            },
          ],
        },
      }),
    ];
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={teams} />);
    expect(html).not.toContain("does not use FAAB");
    expect(html).toContain("$0");
    expect(html).toContain("$100");
  });
});
