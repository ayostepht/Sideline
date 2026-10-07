/**
 * TRADE-1..TRADE-4 (PLAN 5.9): evaluate one proposed trade. Each team's before/after is its
 * optimal rest-of-season lineup total (see `lineup.ts`); fairness comes from `tradeFairness`.
 * Playoff-odds deltas are composed server-side, not here.
 */
import type { Reason, TradeFairness } from "@sideline/shared";
import { tradeFairness } from "./fairness.js";
import { applyTrade, rosLineup, type ApplyTradeError, type TradeTeam } from "./lineup.js";

export interface EvaluateTradeInput {
  rosterPositions: readonly string[];
  mine: TradeTeam;
  theirs: TradeTeam;
  give: readonly string[];
  get: readonly string[];
}

export interface TradeSideResult {
  rosterId: number;
  rosLineupBefore: number;
  rosLineupAfter: number;
  rosLineupDelta: number;
  dropped: string[];
  reasons: Reason[];
}

export interface EvaluatedTrade {
  give: string[];
  get: string[];
  mine: TradeSideResult;
  theirs: TradeSideResult;
  fairness: TradeFairness;
  reasons: Reason[];
}

export type EvaluateTradeResult = ({ ok: true } & EvaluatedTrade) | ApplyTradeError;

const FAIRNESS_LABEL: Record<TradeFairness, string> = {
  fair: "Both teams gain about the same",
  leans_you: "Leans your way",
  leans_them: "Leans their way",
  lopsided: "One-sided or no gain for a team",
};

function sideResult(
  rosterPositions: readonly string[],
  before: TradeTeam,
  after: TradeTeam,
  dropped: string[],
  cache?: { total: number; starters: string[] },
): TradeSideResult {
  const b = cache ?? rosLineup(rosterPositions, before);
  const a = rosLineup(rosterPositions, after);
  const beforeSet = new Set(b.starters);
  const afterSet = new Set(a.starters);
  const delta = a.total - b.total;
  const reasons: Reason[] = [
    {
      code: "TRADE_LINEUP_DELTA",
      label: "Change in rest-of-season best lineup",
      value: delta,
      impact: delta,
    },
  ];
  for (const id of a.starters) {
    if (!beforeSet.has(id)) {
      reasons.push({
        code: "TRADE_ENTERS_LINEUP",
        label: `${id} joins the best lineup`,
        value: id,
      });
    }
  }
  for (const id of b.starters) {
    if (!afterSet.has(id)) {
      reasons.push({
        code: "TRADE_LEAVES_LINEUP",
        label: `${id} leaves the best lineup`,
        value: id,
      });
    }
  }
  for (const id of dropped) {
    reasons.push({
      code: "TRADE_AUTO_DROP",
      label: `${id} is dropped to make room (lowest-value bench player)`,
      value: id,
    });
  }
  return {
    rosterId: before.rosterId,
    rosLineupBefore: b.total,
    rosLineupAfter: a.total,
    rosLineupDelta: delta,
    dropped,
    reasons,
  };
}

/** @internal shared with the finder so the "before" lineups are computed once per team. */
export function evaluateWithBaselines(
  input: EvaluateTradeInput,
  baselineMine?: { total: number; starters: string[] },
  baselineTheirs?: { total: number; starters: string[] },
): EvaluateTradeResult {
  const applied = applyTrade(input.mine, input.theirs, input.give, input.get);
  if (!applied.ok) return applied;
  const mine = sideResult(
    input.rosterPositions,
    input.mine,
    applied.mine,
    applied.droppedMine,
    baselineMine,
  );
  const theirs = sideResult(
    input.rosterPositions,
    input.theirs,
    applied.theirs,
    applied.droppedTheirs,
    baselineTheirs,
  );
  const fairness = tradeFairness(mine.rosLineupDelta, theirs.rosLineupDelta);
  return {
    ok: true,
    give: [...input.give],
    get: [...input.get],
    mine,
    theirs,
    fairness,
    reasons: [
      {
        code: "TRADE_FAIRNESS",
        label: FAIRNESS_LABEL[fairness],
        value: fairness,
      },
    ],
  };
}

/** TRADE-1/TRADE-2/TRADE-4: evaluate a trade for both teams. Invalid input returns `ok: false`. */
export function evaluateTrade(input: EvaluateTradeInput): EvaluateTradeResult {
  return evaluateWithBaselines(input);
}
