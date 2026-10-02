import { describe, expect, it } from "vitest";
import {
  collectReferencedPlayerIds,
  comparePlayerIds,
  isRealRow,
  PLAYER_FIELDS,
  playerNameCollides,
  projectPlayers,
  rowPlayerIds,
  selectPlayerIds,
  trimRows,
} from "./trim.js";
import { syntheticPlayers } from "./test-data.js";

function row(id: string, position: string, stats: Record<string, number>): unknown {
  return { player_id: id, stats, player: { position } };
}

describe("comparePlayerIds", () => {
  it("sorts numeric ids numerically, then team codes", () => {
    expect(["ATL", "10", "9", "BAL", "100"].sort(comparePlayerIds)).toEqual([
      "9",
      "10",
      "100",
      "ATL",
      "BAL",
    ]);
  });
});

describe("collectReferencedPlayerIds", () => {
  it("collects ids from rosters, matchups, transactions, picks and trending, ignoring empty slots", () => {
    const ids = collectReferencedPlayerIds({
      rosters: [{ players: ["1", "ATL"], starters: ["2", "0"], reserve: ["3"], taxi: null }],
      matchups: [[{ players: ["4"], starters: ["5"], players_points: { "6": 1, MIN: 2 } }]],
      transactions: [
        [
          { adds: { "7": 1 }, drops: { "8": 1 } },
          { adds: null, drops: null },
        ],
      ],
      draftPicks: [[{ player_id: "9" }]],
      trending: [[{ player_id: "10", count: 3 }]],
    });
    expect([...ids].sort(comparePlayerIds)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "ATL",
      "MIN",
    ]);
  });
});

describe("selectPlayerIds and projectPlayers", () => {
  const all = syntheticPlayers();

  it("keeps referenced players, the top N by search_rank and every DEF entry", () => {
    const keep = selectPlayerIds(all, new Set(["1001", "missing"]), 2);
    expect([...keep].sort(comparePlayerIds)).toEqual(["1001", "1005", "1008", "ATL", "BAL"]);
  });

  it("treats the unranked sentinel as no rank", () => {
    const keep = selectPlayerIds(all, new Set(), 100);
    expect(keep.has("1002")).toBe(false);
  });

  it("keeps only allowlisted fields, in player id order", () => {
    const out = projectPlayers(all, new Set(["1002", "ATL", "1001"]));
    expect(Object.keys(out)).toEqual(["1001", "1002", "ATL"]);
    const p = out["1002"] ?? {};
    expect(p.college).toBeUndefined();
    expect(p.metadata).toBeUndefined();
    expect(Object.keys(p).every((k) => (PLAYER_FIELDS as readonly string[]).includes(k))).toBe(
      true,
    );
    expect(p.full_name).toBe("Ray Runner");
    expect(out.ATL?.last_name).toBe("Falcons");
  });
});

describe("playerNameCollides", () => {
  it("flags full names containing an original name (4+ chars, case-insensitive)", () => {
    const player = { full_name: "Gridiron Goblins", search_full_name: "gridirongoblins" };
    expect(playerNameCollides(player, ["gridiron goblins"])).toBe(true);
    expect(playerNameCollides(player, ["Sunday Scaries"])).toBe(false);
    expect(playerNameCollides(player, ["Qu"])).toBe(false);
    expect(playerNameCollides(null, ["anything"])).toBe(false);
  });
});

describe("trimRows", () => {
  const rows: unknown[] = [
    row("1", "QB", { gp: 1, pass_yd: 100 }), // real
    row("2", "RB", { adp_dd_ppr: 50 }), // in player set
    row("3", "FB", { adp_dd_ppr: 60 }), // leaked position
    row("4", "WR", { adp_dd_ppr: 70 }), // placeholder
    row("5", "P", { gp: 1 }), // real and leaked: counted once as real
    ...Array.from({ length: 100 }, (_, i) => row(String(1000 + i), "WR", { adp_dd_ppr: i })),
  ];

  it("keeps real rows, set rows and leaked positions, and samples placeholders", () => {
    const { rows: out, stats } = trimRows(rows, new Set(["2"]), 10);
    const ids = rowPlayerIds(out);
    for (const id of ["1", "2", "3", "5"]) expect(ids.has(id)).toBe(true);
    expect(stats.real).toBe(2);
    expect(stats.inPlayerSet).toBe(1);
    expect(stats.leakedPositions).toBe(1);
    expect(stats.placeholderSample).toBe(10);
    expect(stats.kept).toBe(out.length);
    expect(stats.kept + stats.dropped).toBe(stats.total);
  });

  it("is deterministic and ordered by player id", () => {
    const a = trimRows(rows, new Set(["2"]), 10).rows;
    const b = trimRows([...rows].reverse(), new Set(["2"]), 10).rows;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ids = [...rowPlayerIds(a)];
    expect([...ids].sort(comparePlayerIds)).toEqual(ids);
  });

  it("handles empty input", () => {
    expect(trimRows([], new Set())).toMatchObject({ rows: [], stats: { total: 0, kept: 0 } });
  });

  it("identifies real rows by stats.gp", () => {
    expect(isRealRow(row("1", "QB", { gp: 1 }))).toBe(true);
    expect(isRealRow(row("1", "QB", { adp_dd_ppr: 1 }))).toBe(false);
    expect(isRealRow(null)).toBe(false);
  });
});
