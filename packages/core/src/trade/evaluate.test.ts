import { describe, expect, it } from "vitest";
import { evaluateTrade } from "./evaluate.js";
import { pl } from "./fixtures.js";

const POS = ["RB", "WR", "BN"];
const mine = { rosterId: 1, players: [pl("r1", "RB", 20), pl("r2", "RB", 15), pl("w1", "WR", 5)] };
const theirs = {
  rosterId: 2,
  players: [pl("r9", "RB", 6), pl("w2", "WR", 18), pl("w3", "WR", 17)],
};

describe("evaluateTrade", () => {
  it("scores both sides and explains it", () => {
    // Me: before RB20 + WR5 = 25. Give r2, get w2: RB20 + WR18 = 38 -> +13.
    // Them: before RB6 + WR18 = 24. After RB15 + WR17 = 32 -> +8. ratio 8/13 = 0.615 -> leans_you.
    const r = evaluateTrade({ rosterPositions: POS, mine, theirs, give: ["r2"], get: ["w2"] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.mine.rosLineupBefore).toBeCloseTo(25, 10);
    expect(r.mine.rosLineupDelta).toBeCloseTo(13, 10);
    expect(r.theirs.rosLineupDelta).toBeCloseTo(8, 10);
    expect(r.fairness).toBe("leans_you");
    expect(r.mine.reasons.map((x) => x.code)).toEqual(
      expect.arrayContaining(["TRADE_LINEUP_DELTA", "TRADE_ENTERS_LINEUP", "TRADE_LEAVES_LINEUP"]),
    );
    expect(r.reasons[0]?.code).toBe("TRADE_FAIRNESS");
  });

  it("reports auto-drops", () => {
    const r = evaluateTrade({
      rosterPositions: POS,
      mine,
      theirs,
      give: ["r1", "r2"],
      get: ["w2"],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.theirs.dropped).toEqual(["r9"]);
    expect(r.theirs.reasons.some((x) => x.code === "TRADE_AUTO_DROP")).toBe(true);
  });

  it("returns an error result for invalid input", () => {
    const r = evaluateTrade({ rosterPositions: POS, mine, theirs, give: ["nope"], get: ["w2"] });
    expect(r.ok).toBe(false);
  });
});
