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

describe("ManagerTendenciesList / pluralization (T6.3c)", () => {
  it("uses the singular form for a count of exactly 1", () => {
    const teams = [
      team({
        managerTendencies: {
          transactionCount: 1,
          waiverClaimsWon: 1,
          tradeCount: 1,
          faabSpent: null,
          faabRemaining: null,
          faabAverageWinningBid: null,
          faabMaxWinningBid: null,
          reasons: [],
        },
      }),
    ];
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={teams} />);
    // Count and noun render in separate sibling spans (e.g. `<b>1</b> <span>transaction</span>`),
    // so assert on the exact noun text rather than a "1 transaction" contiguous string.
    expect(html).toContain(">transaction<");
    expect(html).not.toContain(">transactions<");
    expect(html).toContain(">trade<");
    expect(html).not.toContain(">trades<");
    expect(html).toContain(">waiver claim won<");
    expect(html).not.toContain(">waiver claims won<");
  });

  it("uses the plural form for counts other than 1, including zero", () => {
    const teams = [
      team({
        managerTendencies: {
          transactionCount: 0,
          waiverClaimsWon: 2,
          tradeCount: 3,
          faabSpent: null,
          faabRemaining: null,
          faabAverageWinningBid: null,
          faabMaxWinningBid: null,
          reasons: [],
        },
      }),
    ];
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={teams} />);
    expect(html).toContain(">transactions<");
    expect(html).toContain(">trades<");
    expect(html).toContain(">waiver claims won<");
  });
});

describe("ManagerTendenciesList / desktop table and You marker (T6.3c)", () => {
  it("shows a denser table at lg and up alongside the mobile card list", () => {
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={[team({})]} />);
    expect(html).toContain('data-testid="manager-tendencies-table"');
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:block");
  });

  it("marks the viewer's own team with a You badge in both the card and table rows", () => {
    const teams = [
      team({ rosterId: 1, teamName: "Mine" }),
      team({ rosterId: 2, teamName: "Other" }),
    ];
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={teams} myRosterId={1} />);
    const occurrences = html.split('data-testid="manager-tendencies-you"').length - 1;
    expect(occurrences).toBe(2);
    const mineOccurrences = html.split('data-mine="true"').length - 1;
    expect(mineOccurrences).toBe(2);
  });

  it("marks no team when myRosterId is omitted", () => {
    const html = renderToStaticMarkup(<ManagerTendenciesList teams={[team({})]} />);
    expect(html).not.toContain('data-testid="manager-tendencies-you"');
    expect(html).not.toContain('data-mine="true"');
  });
});
