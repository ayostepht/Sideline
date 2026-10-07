import { describe, expect, it } from "vitest";
import { computePositionalHeatmap } from "../league/positional-heatmap.js";
import { findTrades } from "./finder.js";
import { pl, simpleHeatmapEntries } from "./fixtures.js";
import type { TradeTeam } from "./lineup.js";

const POS = ["QB", "RB", "RB", "WR", "WR", "BN", "BN"];

// Me: strong RB (R1 20, R2 18, R3 17 bench), weak WR (W 10, 4).
// Team 2: weak RB (8, 7), strong WR (20, 18, 17 bench). Teams 3, 4 are balanced filler.
const me: TradeTeam = {
  rosterId: 1,
  players: [
    pl("q1", "QB", 15),
    pl("R1", "RB", 20),
    pl("R2", "RB", 18),
    pl("R3", "RB", 17),
    pl("Wa", "WR", 10),
    pl("Wb", "WR", 4),
  ],
};
const t2: TradeTeam = {
  rosterId: 2,
  players: [
    pl("q2", "QB", 15),
    pl("S1", "RB", 8),
    pl("S2", "RB", 7),
    pl("X1", "WR", 20),
    pl("X2", "WR", 18),
    pl("X3", "WR", 17),
  ],
};
const filler = (id: number): TradeTeam => ({
  rosterId: id,
  players: [
    pl(`q${id}`, "QB", 15),
    pl(`b${id}r1`, "RB", 12),
    pl(`b${id}r2`, "RB", 11),
    pl(`b${id}w1`, "WR", 12),
    pl(`b${id}w2`, "WR", 11),
  ],
});
const teams = [me, t2, filler(3), filler(4)];
const heatmap = computePositionalHeatmap(simpleHeatmapEntries(teams));
const run = () =>
  findTrades({ rosterPositions: POS, me, others: [t2, filler(3), filler(4)], heatmap });

describe("findTrades (TRADE-2)", () => {
  it("ranks the complementary RB-for-WR trade first", () => {
    const r = run();
    expect(r.evaluatedCount).toBeGreaterThan(0);
    const top = r.suggestions[0];
    expect(top?.otherRosterId).toBe(2);
    // Hand-computed: give R1 (20), get X3 (17, their bench WR).
    // Them: RB 8+7=15 -> 20+8=28 (+13); WR unchanged (X1 20, X2 18 still start). Gain 13.
    // Me: RB 20+18=38 -> 18+17=35 (-3); WR 10+4=14 -> 17+10=27 (+13). Gain 10.
    // Their gain is the primary sort key, and no other combination gives them more than 13.
    expect(top?.give).toEqual(["R1"]);
    expect(top?.get).toEqual(["X3"]);
    expect(top?.theirs.rosLineupDelta).toBeCloseTo(13, 10);
    expect(top?.mine.rosLineupDelta).toBeCloseTo(10, 10);
  });

  it("never suggests a non-positive delta for either side", () => {
    for (const s of run().suggestions) {
      expect(s.mine.rosLineupDelta).toBeGreaterThan(0.01);
      expect(s.theirs.rosLineupDelta).toBeGreaterThan(0.01);
      expect(s.reasons.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic and honors limit", () => {
    expect(run()).toEqual(run());
    const r = findTrades({
      rosterPositions: POS,
      me,
      others: [t2],
      heatmap,
      limit: 1,
    });
    expect(r.suggestions).toHaveLength(1);
  });

  it("returns nothing without complementary needs", () => {
    const r = findTrades({ rosterPositions: POS, me, others: [filler(3)], heatmap: [] });
    expect(r).toEqual({ suggestions: [], evaluatedCount: 0 });
  });
});
