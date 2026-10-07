/**
 * TRADE-2 (PLAN 5.9, ADR-022 items 7 and 7a): trade finder. Looks for 1-for-1, 2-for-1 (I give 2,
 * get 1) and 1-for-2 trades against every other team where BOTH teams' ROS lineup delta exceeds
 * {@link MIN_TRADE_GAIN}. Trades whose `tradeFairness` is `lopsided` (TRADE-4) are excluded.
 *
 * Prefilter (needs): the heatmap is keyed by SLOT type (QB, RB, WR, TE, FLEX, ...). A slot type
 * maps to player positions via `SLOT_ELIGIBILITY` (FLEX -> RB/WR/TE, SUPER_FLEX -> QB/RB/WR/TE,
 * ...). For a given other team:
 * - GET positions = positions of slot types where my delta < 0 and theirs > 0 (they are strong
 *   where I am weak). The GET pool comes from THEIR surplus positions.
 * - GIVE positions = positions of slot types where my delta > 0 and theirs < 0. The GIVE pool
 *   comes from MY surplus positions.
 * Pools: non-reserve players with a fantasy position in the set. Players are ranked by rosValue
 * desc (ties by playerId) WITHIN each position, then the pool is filled round-robin by rank
 * across the surplus positions (every position's best player, then every position's second
 * best, ...) up to `maxCandidatesPerSide` (default {@link DEFAULT_MAX_CANDIDATES_PER_SIDE}).
 * This keeps one deep position from crowding the others out of the cap.
 *
 * Ranking: `min(myGain, theirGain)` desc (both sides must gain meaningfully, so the other
 * manager might accept), then my gain desc, then the sorted player-id key. The 2-for-1 shape
 * is not specially guarded: a side that gains mostly by filling an empty slot with a second
 * player produces a big gain for that side only, so the min-gain ranking (and the lopsided
 * exclusion) already pushes it down.
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
  const byPos = new Map<string, TradePlayer[]>();
  for (const p of team.players) {
    if (p.reserve) continue;
    const pos = [...p.fantasyPositions].sort().find((x) => positions.has(x));
    if (pos === undefined) continue;
    const list = byPos.get(pos) ?? [];
    list.push(p);
    byPos.set(pos, list);
  }
  const better = (a: TradePlayer, b: TradePlayer) =>
    b.rosValue - a.rosValue || (a.playerId < b.playerId ? -1 : 1);
  for (const list of byPos.values()) list.sort(better);
  const out: TradePlayer[] = [];
  for (let rank = 0; out.length < max; rank++) {
    const round: TradePlayer[] = [];
    for (const list of byPos.values()) {
      const p = list[rank];
      if (p !== undefined) round.push(p);
    }
    if (round.length === 0) break;
    round.sort(better);
    for (const p of round) if (out.length < max) out.push(p);
  }
  return out;
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
          if (
            r.mine.rosLineupDelta > MIN_TRADE_GAIN &&
            r.theirs.rosLineupDelta > MIN_TRADE_GAIN &&
            r.fairness !== "lopsided"
          ) {
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
  const minGain = (t: FoundTrade) => Math.min(t.mine.rosLineupDelta, t.theirs.rosLineupDelta);
  found.sort(
    (a, b) =>
      minGain(b) - minGain(a) ||
      b.mine.rosLineupDelta - a.mine.rosLineupDelta ||
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
  return { suggestions: found.slice(0, Math.max(0, limit)), evaluatedCount };
}
