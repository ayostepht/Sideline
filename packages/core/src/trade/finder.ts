/**
 * TRADE-2 (PLAN 5.9, ADR-022 item 5): trade finder. Looks for 1-for-1, 2-for-1 (I give 2, get 1)
 * and 1-for-2 trades against every other team where BOTH teams' ROS lineup delta exceeds
 * {@link MIN_TRADE_GAIN}.
 *
 * Prefilter (needs): the heatmap is keyed by SLOT type (QB, RB, WR, TE, FLEX, ...). A slot type
 * maps to player positions via `SLOT_ELIGIBILITY` (FLEX -> RB/WR/TE, SUPER_FLEX -> QB/RB/WR/TE,
 * ...). For a given other team:
 * - GET positions = positions of slot types where my delta < 0 and theirs > 0 (they are strong
 *   where I am weak).
 * - GIVE positions = positions of slot types where my delta > 0 and theirs < 0.
 * Candidates are non-reserve players with a fantasy position in the set, the top
 * `maxCandidatesPerSide` (default {@link DEFAULT_MAX_CANDIDATES_PER_SIDE}) by rosValue desc
 * (ties by playerId). Ranking: their gain desc, my gain desc, then sorted player-id key.
 */
import { SLOT_ELIGIBILITY } from "../optimizer/eligibility.js";
import type { PositionalStrengthResult } from "../league/positional-heatmap.js";
import { evaluateWithBaselines, type EvaluatedTrade } from "./evaluate.js";
import { rosLineup, type TradePlayer, type TradeTeam } from "./lineup.js";

export const MIN_TRADE_GAIN = 0.01;
export const DEFAULT_TRADE_FINDER_LIMIT = 25;
export const DEFAULT_MAX_CANDIDATES_PER_SIDE = 6;

export interface FindTradesInput {
  rosterPositions: readonly string[];
  me: TradeTeam;
  others: readonly TradeTeam[];
  heatmap: readonly PositionalStrengthResult[];
  limit?: number;
  maxCandidatesPerSide?: number;
}

export interface FoundTrade extends EvaluatedTrade {
  otherRosterId: number;
}

export interface FindTradesResult {
  suggestions: FoundTrade[];
  evaluatedCount: number;
}

function deltaBySlot(heatmap: readonly PositionalStrengthResult[], rosterId: number) {
  const m = new Map<string, number>();
  for (const h of heatmap) if (h.rosterId === rosterId) m.set(h.position, h.delta);
  return m;
}

function needPositions(
  weak: ReadonlyMap<string, number>,
  strong: ReadonlyMap<string, number>,
): Set<string> {
  const out = new Set<string>();
  for (const [slot, d] of weak) {
    const other = strong.get(slot);
    if (d < 0 && other !== undefined && other > 0) {
      for (const pos of SLOT_ELIGIBILITY[slot] ?? []) out.add(pos);
    }
  }
  return out;
}

function candidates(team: TradeTeam, positions: ReadonlySet<string>, max: number): TradePlayer[] {
  return team.players
    .filter((p) => !p.reserve && p.fantasyPositions.some((pos) => positions.has(pos)))
    .sort((a, b) => b.rosValue - a.rosValue || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, max);
}

function subsets(pool: readonly TradePlayer[], size: 1 | 2): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (a === undefined) continue;
    if (size === 1) out.push([a.playerId]);
    else {
      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j];
        if (b !== undefined) out.push([a.playerId, b.playerId]);
      }
    }
  }
  return out;
}

function key(t: FoundTrade): string {
  return `${t.otherRosterId}|${[...t.give].sort().join(",")}|${[...t.get].sort().join(",")}`;
}

export function findTrades(input: FindTradesInput): FindTradesResult {
  const limit = input.limit ?? DEFAULT_TRADE_FINDER_LIMIT;
  const maxC = input.maxCandidatesPerSide ?? DEFAULT_MAX_CANDIDATES_PER_SIDE;
  const myDeltas = deltaBySlot(input.heatmap, input.me.rosterId);
  const myBase = rosLineup(input.rosterPositions, input.me);
  const found: FoundTrade[] = [];
  let evaluatedCount = 0;

  for (const other of input.others) {
    if (other.rosterId === input.me.rosterId) continue;
    const theirDeltas = deltaBySlot(input.heatmap, other.rosterId);
    const getPos = needPositions(myDeltas, theirDeltas);
    const givePos = needPositions(theirDeltas, myDeltas);
    if (getPos.size === 0 || givePos.size === 0) continue;
    const getPool = candidates(other, getPos, maxC);
    const givePool = candidates(input.me, givePos, maxC);
    if (getPool.length === 0 || givePool.length === 0) continue;
    const theirBase = rosLineup(input.rosterPositions, other);
    const shapes: [string[][], string[][]][] = [
      [subsets(givePool, 1), subsets(getPool, 1)],
      [subsets(givePool, 2), subsets(getPool, 1)],
      [subsets(givePool, 1), subsets(getPool, 2)],
    ];
    for (const [gives, gets] of shapes) {
      for (const give of gives) {
        for (const get of gets) {
          evaluatedCount += 1;
          const r = evaluateWithBaselines(
            { rosterPositions: input.rosterPositions, mine: input.me, theirs: other, give, get },
            myBase,
            theirBase,
          );
          if (!r.ok) continue;
          if (r.mine.rosLineupDelta > MIN_TRADE_GAIN && r.theirs.rosLineupDelta > MIN_TRADE_GAIN) {
            found.push({
              otherRosterId: other.rosterId,
              give: r.give,
              get: r.get,
              mine: r.mine,
              theirs: r.theirs,
              fairness: r.fairness,
              reasons: r.reasons,
            });
          }
        }
      }
    }
  }
  found.sort(
    (a, b) =>
      b.theirs.rosLineupDelta - a.theirs.rosLineupDelta ||
      b.mine.rosLineupDelta - a.mine.rosLineupDelta ||
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
  return { suggestions: found.slice(0, Math.max(0, limit)), evaluatedCount };
}
