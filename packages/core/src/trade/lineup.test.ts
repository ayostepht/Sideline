import { describe, expect, it } from "vitest";
import { applyTrade, rosLineupTotal, type TradeTeam } from "./lineup.js";
import { mulberry32, pl } from "./fixtures.js";

const POS = ["QB", "RB", "WR", "FLEX", "BN", "BN"];

// Hand-computed: QB q1=20. RB: r1=15, r2=9. WR: w1=12. Slots QB, RB, WR, FLEX.
// QB=20, RB=15, WR=12, FLEX = best remaining RB/WR/TE = r2 9. Total = 56.
const team: TradeTeam = {
  rosterId: 1,
  players: [
    pl("q1", "QB", 20),
    pl("r1", "RB", 15),
    pl("r2", "RB", 9),
    pl("w1", "WR", 12),
    pl("r3", "RB", 2),
    pl("ir", "WR", 99, true),
  ],
};

describe("rosLineupTotal", () => {
  it("matches a hand-computed lineup and ignores reserve players", () => {
    expect(rosLineupTotal(POS, team)).toBeCloseTo(56, 10);
  });
  it("empty roster is 0", () => {
    expect(rosLineupTotal(POS, { rosterId: 1, players: [] })).toBe(0);
  });
});

const other: TradeTeam = {
  rosterId: 2,
  players: [pl("q2", "QB", 18), pl("w2", "WR", 14), pl("w3", "WR", 10), pl("r9", "RB", 5)],
};

describe("applyTrade", () => {
  it("1-for-1 swaps players and drops nobody", () => {
    const r = applyTrade(team, other, ["r2"], ["w2"]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.droppedMine).toEqual([]);
    expect(r.droppedTheirs).toEqual([]);
    expect(r.mine.players.map((p) => p.playerId).sort()).toEqual(
      ["ir", "q1", "r1", "r3", "w1", "w2"].sort(),
    );
    // QB20 + RB15 + WR14 + FLEX 12 (w1) = 61; before 56 -> +5.
    expect(rosLineupTotal(POS, r.mine) - rosLineupTotal(POS, team)).toBeCloseTo(5, 10);
  });

  it("2-for-1 auto-drops the lowest non-reserve existing player, never incoming or reserve", () => {
    // I give r1+r2 (2), get w2 (1): THEY receive 1 extra, so they drop one of their own.
    const r = applyTrade(team, other, ["r1", "r2"], ["w2"]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.droppedMine).toEqual([]);
    expect(r.droppedTheirs).toEqual(["r9"]); // their lowest (5), not incoming r1/r2
    expect(r.theirs.players.map((p) => p.playerId).sort()).toEqual(["q2", "r1", "r2", "w3"]);
  });

  it("auto-drop skips reserve players and breaks ties by playerId", () => {
    const t: TradeTeam = {
      rosterId: 2,
      players: [pl("a", "WR", 1, true), pl("c", "WR", 3), pl("b", "WR", 3), pl("z", "WR", 8)],
    };
    const r = applyTrade(team, t, ["r1", "r2"], ["z"]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.droppedTheirs).toEqual(["b"]);
  });

  it("1-for-2 makes me drop my lowest non-reserve player", () => {
    const r = applyTrade(team, other, ["q1"], ["w2", "w3"]);
    if (!r.ok) throw new Error("expected ok");
    expect(r.droppedMine).toEqual(["r3"]); // value 2; ir (reserve) is never dropped
  });

  it("returns typed errors instead of throwing", () => {
    const code = (g: string[], t: string[]) => {
      const r = applyTrade(team, other, g, t);
      return r.ok ? "ok" : r.code;
    };
    expect(code([], ["w2"])).toBe("EMPTY_SIDE");
    expect(code(["r1"], [])).toBe("EMPTY_SIDE");
    expect(code(["r1", "r1"], ["w2"])).toBe("DUPLICATE_PLAYER");
    expect(code(["w2"], ["w3"])).toBe("PLAYER_NOT_ON_ROSTER");
    expect(code(["r1"], ["r2"])).toBe("PLAYER_NOT_ON_ROSTER");
    expect(code(["r1", "r2", "w1", "r3"], ["w2"])).toBe("TOO_MANY_PLAYERS");
  });
});

describe("applyTrade properties (seeded)", () => {
  it("conserves value minus drops and matches a fresh lineup total", () => {
    const rnd = mulberry32(42);
    const positions = ["QB", "RB", "WR", "TE"];
    const mk = (rosterId: number, prefix: string): TradeTeam => ({
      rosterId,
      players: Array.from({ length: 8 + Math.floor(rnd() * 6) }, (_, i) =>
        pl(
          `${prefix}${i}`,
          positions[Math.floor(rnd() * 4)] ?? "RB",
          Math.round(rnd() * 200) / 10,
          rnd() < 0.15,
        ),
      ),
    });
    for (let iter = 0; iter < 200; iter++) {
      const a = mk(1, "a");
      const b = mk(2, "b");
      const give = a.players.slice(0, 1 + Math.floor(rnd() * 3)).map((p) => p.playerId);
      const get = b.players.slice(0, 1 + Math.floor(rnd() * 3)).map((p) => p.playerId);
      const r = applyTrade(a, b, give, get);
      if (!r.ok) throw new Error("expected ok");
      const sum = (t: TradeTeam) => t.players.reduce((s, p) => s + p.rosValue, 0);
      const all = [...a.players, ...b.players];
      const droppedValue = [...r.droppedMine, ...r.droppedTheirs].reduce(
        (s, id) => s + (all.find((p) => p.playerId === id)?.rosValue ?? 0),
        0,
      );
      expect(sum(r.mine) + sum(r.theirs)).toBeCloseTo(sum(a) + sum(b) - droppedValue, 8);
      const dropped = new Set([...r.droppedMine, ...r.droppedTheirs]);
      for (const id of dropped) {
        expect(all.find((p) => p.playerId === id)?.reserve).toBe(false);
        expect([...give, ...get]).not.toContain(id);
      }
      // Fresh recompute from the rebuilt roster equals itself (determinism) and is >= 0.
      const fresh = rosLineupTotal(POS, { rosterId: 1, players: [...r.mine.players] });
      expect(rosLineupTotal(POS, r.mine)).toBeCloseTo(fresh, 10);
    }
  });
});
