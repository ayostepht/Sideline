import type { TradeEvaluateResponse, TradeSuggestion, TradeTeamImpact } from "@sideline/shared";

export const impact = (over: Partial<TradeTeamImpact> = {}): TradeTeamImpact => ({
  rosterId: 1,
  rosLineupBefore: 100,
  rosLineupAfter: 108.4,
  rosLineupDelta: 8.4,
  playoffPctBefore: 0.41,
  playoffPctAfter: 0.47,
  playoffPctDelta: 0.06,
  dropped: [],
  reasons: [],
  ...over,
});

export const suggestion = (over: Partial<TradeSuggestion> = {}): TradeSuggestion => ({
  otherRosterId: 3,
  give: [{ playerId: "p1", name: "Alpha Back", position: "RB", nflTeam: "KC" }],
  get: [{ playerId: "p2", name: "Beta Wideout", position: "WR", nflTeam: "SF" }],
  mine: impact(),
  theirs: impact({
    rosterId: 3,
    rosLineupDelta: 6.1,
    playoffPctBefore: null,
    playoffPctAfter: null,
    playoffPctDelta: null,
  }),
  fairness: "fair",
  reasons: [{ code: "TRADE_FAIRNESS", label: "Both teams gain about the same" }],
  ...over,
});

export const evaluation = (over: Partial<TradeEvaluateResponse> = {}): TradeEvaluateResponse => {
  const s = suggestion();
  return {
    give: s.give,
    get: s.get,
    mine: s.mine,
    theirs: impact({
      rosterId: 3,
      rosLineupDelta: 6.1,
      playoffPctBefore: null,
      playoffPctAfter: null,
      playoffPctDelta: null,
      dropped: [{ playerId: "p9", name: "Gamma Tight", position: "TE", nflTeam: "DAL" }],
      reasons: [
        {
          code: "TRADE_PLAYOFF_UNAVAILABLE",
          label: "Playoff odds are not available in the offseason.",
        },
      ],
    }),
    fairness: "fair",
    reasons: s.reasons,
    freshness: { updatedAt: null, stale: false, maxAgeMs: 1 } as TradeEvaluateResponse["freshness"],
    ...over,
  };
};
