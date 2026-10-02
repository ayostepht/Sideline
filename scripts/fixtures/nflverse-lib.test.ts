import { describe, expect, it } from "vitest";
import {
  buildMatcher,
  impliedTotals,
  inWindow,
  keepSnapRow,
  keepStatsRow,
  kickoffUtc,
  normalizeName,
  parseCsv,
  sortRows,
  toCsv,
  toNflverseTeam,
  trimColumns,
} from "./nflverse-lib.js";

describe("parseCsv / toCsv", () => {
  it("round-trips quotes, commas and CRLF", () => {
    const text = 'a,b,c\r\n1,"x, y",3\r\n4,"say ""hi""",\r\n';
    const t = parseCsv(text);
    expect(t.header).toEqual(["a", "b", "c"]);
    expect(t.rows).toEqual([
      { a: "1", b: "x, y", c: "3" },
      { a: "4", b: 'say "hi"', c: "" },
    ]);
    expect(toCsv(t.header, t.rows)).toBe('a,b,c\n1,"x, y",3\n4,"say ""hi""",\n');
  });

  it("handles a missing trailing newline and blank lines", () => {
    expect(parseCsv("a\n1\n\n2").rows).toEqual([{ a: "1" }, { a: "2" }]);
  });
});

describe("trimColumns", () => {
  it("keeps requested columns in order and throws on a missing column", () => {
    const t = parseCsv("a,b,c\n1,2,3\n");
    expect(trimColumns(t, ["c", "a"])).toEqual({ header: ["c", "a"], rows: [{ c: "3", a: "1" }] });
    expect(() => trimColumns(t, ["z"])).toThrow(/missing columns: z/);
  });
});

describe("sortRows", () => {
  it("sorts numerically then lexically and is independent of input order", () => {
    const rows = [
      { week: "10", id: "b" },
      { week: "2", id: "z" },
      { week: "2", id: "a" },
    ];
    const sorted = sortRows(rows, ["week", "id"]);
    expect(sorted.map((r) => `${r.week}${r.id}`)).toEqual(["2a", "2z", "10b"]);
    expect(sortRows([...rows].reverse(), ["week", "id"])).toEqual(sorted);
  });
});

describe("matching", () => {
  const matcher = buildMatcher([
    { full_name: "Joshua Palmer", team: "BUF", gsis_id: " 00-0033333" },
    { full_name: "Puka Nacua", team: "LAR", gsis_id: null },
  ]);
  const keepTeams = new Set(["KC"]);

  it("normalizes names and maps LAR to LA", () => {
    expect(normalizeName("D.K. Metcalf Jr.")).toBe("dk metcalf");
    expect(toNflverseTeam("LAR")).toBe("LA");
    expect(toNflverseTeam("SEA")).toBe("SEA");
  });

  it("keeps stats rows by trimmed gsis id, by name plus team, and by kept team", () => {
    const base = { player_id: "", player_display_name: "", team: "" };
    expect(
      keepStatsRow({ ...base, player_id: "00-0033333", team: "NYJ" }, { matcher, keepTeams }),
    ).toBe(true);
    expect(
      keepStatsRow(
        { ...base, player_display_name: "Puka Nacua", team: "LA" },
        { matcher, keepTeams },
      ),
    ).toBe(true);
    expect(
      keepStatsRow(
        { ...base, player_display_name: "Puka Nacua", team: "SEA" },
        { matcher, keepTeams },
      ),
    ).toBe(false);
    expect(
      keepStatsRow({ ...base, player_display_name: "Nobody", team: "KC" }, { matcher, keepTeams }),
    ).toBe(true);
  });

  it("keeps snap rows by pfr id, name plus team, and kept team", () => {
    const base = { player: "", pfr_player_id: "", team: "" };
    const keepPfrIds = new Set(["PalmJo01"]);
    expect(
      keepSnapRow(
        { ...base, pfr_player_id: "PalmJo01", team: "BUF" },
        { matcher, keepTeams, keepPfrIds },
      ),
    ).toBe(true);
    expect(
      keepSnapRow({ ...base, player: "Joshua Palmer", team: "BUF" }, { matcher, keepTeams }),
    ).toBe(true);
    expect(keepSnapRow({ ...base, player: "Someone", team: "BUF" }, { matcher, keepTeams })).toBe(
      false,
    );
  });

  it("windows rows by season and week", () => {
    expect(inWindow({ season: "2026", week: "3" }, 2026, 3)).toBe(true);
    expect(inWindow({ season: "2026", week: "4" }, 2026, 3)).toBe(false);
    expect(inWindow({ season: "2025", week: "1" }, 2026, 3)).toBe(false);
  });
});

describe("kickoffUtc (America/New_York wall time)", () => {
  it("uses EDT (UTC-4) in September", () => {
    expect(kickoffUtc("2026-09-13", "13:00")).toBe("2026-09-13T17:00:00.000Z");
  });
  it("uses EST (UTC-5) after the first Sunday of November", () => {
    expect(kickoffUtc("2026-11-22", "20:20")).toBe("2026-11-23T01:20:00.000Z");
  });
  it("switches on the DST boundary day (2026-11-01)", () => {
    expect(kickoffUtc("2026-11-01", "13:00")).toBe("2026-11-01T18:00:00.000Z");
    expect(kickoffUtc("2026-10-31", "20:20")).toBe("2026-11-01T00:20:00.000Z");
  });
  it("returns null when gametime or gameday is missing or malformed", () => {
    expect(kickoffUtc("2026-09-13", "")).toBeNull();
    expect(kickoffUtc("", "13:00")).toBeNull();
  });
});

describe("impliedTotals", () => {
  it("favors the home team when spread_line is positive", () => {
    expect(impliedTotals(3, 44.5)).toEqual({ home: 23.75, away: 20.75 });
    expect(impliedTotals(-3, 47.5)).toEqual({ home: 22.25, away: 25.25 });
  });
});
