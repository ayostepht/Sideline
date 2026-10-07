import { describe, expect, it } from "vitest";
import { computePositionalHeatmap } from "../league/positional-heatmap.js";
import { evaluateWithBaselines } from "./evaluate.js";
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
    // Hand-computed, ranked by min(myGain, theirGain). Give R2 (18), get X3 (17, their bench WR):
    // Them: RB 8+7=15 -> 18+8=26 (+11); WR unchanged. Gain 11.
    // Me: RB 20+18=38 -> 20+17=37 (-1); WR 10+4=14 -> 17+10=27 (+13). Gain 12. min = 11.
    // The old their-gain ranking picked give R1 / get X3 (them +13, me +10, min 10); min-gain
    // ranking prefers the more balanced R2 / X3 (min 11). Ratio 11/12 = 0.92, so Fair.
    expect(top?.give).toEqual(["R2"]);
    expect(top?.get).toEqual(["X3"]);
    expect(top?.theirs.rosLineupDelta).toBeCloseTo(11, 10);
    expect(top?.mine.rosLineupDelta).toBeCloseTo(12, 10);
    expect(top?.fairness).toBe("fair");
  });

  it("excludes lopsided trades and orders by min gain, then my gain", () => {
    const s = run().suggestions;
    expect(s.length).toBeGreaterThan(1);
    for (const t of s) expect(t.fairness).not.toBe("lopsided");
    const mins = s.map((t) => Math.min(t.mine.rosLineupDelta, t.theirs.rosLineupDelta));
    for (let i = 1; i < mins.length; i++) {
      expect(mins[i - 1] as number).toBeGreaterThanOrEqual((mins[i] as number) - 1e-9);
    }
  });

  it("ranks a balanced trade above a high-their-gain, low-my-gain one", () => {
    // Me: RB 20, 19, 18 (bench), WR 10, 9. Other: RB 2, 1, WR 30, 29, 12 (bench).
    // Give R1 (20), get X3 (12): they gain RB 3 -> 22 (+19); I gain WR 10+9 -> 12+10 (+3) but
    // lose RB 39 -> 37 (-2): +1. Ratio 1/19 < 0.4, so it is Lopsided and must not be suggested.
    // Give R3 (18, bench) get X3 (12): they gain 3 -> 20 (+17); I gain +3 (WR), RB unchanged:
    // +3, ratio 0.18, also Lopsided. Anything the finder returns must be non-lopsided.
    const m: TradeTeam = {
      rosterId: 1,
      players: [
        pl("q1", "QB", 15),
        pl("R1", "RB", 20),
        pl("R2", "RB", 19),
        pl("R3", "RB", 18),
        pl("Wa", "WR", 10),
        pl("Wb", "WR", 9),
      ],
    };
    const o: TradeTeam = {
      rosterId: 2,
      players: [
        pl("q2", "QB", 15),
        pl("S1", "RB", 2),
        pl("S2", "RB", 1),
        pl("X1", "WR", 30),
        pl("X2", "WR", 29),
        pl("X3", "WR", 12),
      ],
    };
    const hm = computePositionalHeatmap(simpleHeatmapEntries([m, o, filler(3)]));
    const lop = evaluateWithBaselines({
      rosterPositions: POS,
      mine: m,
      theirs: o,
      give: ["R1"],
      get: ["X3"],
    });
    expect(lop.ok && lop.fairness).toBe("lopsided");
    expect(lop.ok && lop.theirs.rosLineupDelta).toBeCloseTo(19, 10);
    const r = findTrades({ rosterPositions: POS, me: m, others: [o], heatmap: hm });
    expect(r.evaluatedCount).toBeGreaterThan(0);
    expect(r.suggestions.some((t) => t.give.join() === "R1" && t.get.join() === "X3")).toBe(false);
    for (const t of r.suggestions) expect(t.fairness).not.toBe("lopsided");
  });

  it("builds the give pool round-robin across surplus positions under the cap", () => {
    // Cap of 2 per side bounds the enumeration.
    const r = findTrades({
      rosterPositions: POS,
      me,
      others: [t2],
      heatmap,
      maxCandidatesPerSide: 2,
    });
    // 2x2 pools: 1-1 (4) + 2-1 (2) + 1-2 (2) = 8 evaluations at most.
    expect(r.evaluatedCount).toBeLessThanOrEqual(8);
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
