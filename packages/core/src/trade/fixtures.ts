import type { PositionalStrengthEntry } from "../league/positional-heatmap.js";
import type { TradePlayer, TradeTeam } from "./lineup.js";

export function pl(id: string, pos: string, rosValue: number, reserve = false): TradePlayer {
  return { playerId: id, fantasyPositions: [pos], rosValue, reserve };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const POSITIONS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN"];

/** Heatmap input from direct (non-flex) slot types: top-N values of each position per team. */
export function simpleHeatmapEntries(teams: TradeTeam[]): PositionalStrengthEntry[] {
  const counts: [string, number][] = [
    ["QB", 1],
    ["RB", 2],
    ["WR", 2],
    ["TE", 1],
  ];
  const out: PositionalStrengthEntry[] = [];
  for (const t of teams) {
    for (const [pos, n] of counts) {
      const vals = t.players
        .filter((p) => !p.reserve && p.fantasyPositions.includes(pos))
        .map((p) => p.rosValue)
        .sort((a, b) => b - a)
        .slice(0, n);
      out.push({ rosterId: t.rosterId, position: pos, value: vals.reduce((s, v) => s + v, 0) });
    }
  }
  return out;
}
