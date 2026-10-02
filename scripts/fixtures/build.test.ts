import { describe, expect, it } from "vitest";
import { buildFixtureFiles } from "./build.js";
import { REAL, syntheticInput } from "./test-data.js";

function json(files: ReadonlyMap<string, string>, path: string): unknown {
  const text = files.get(path);
  if (text === undefined) throw new Error(`missing ${path}`);
  return JSON.parse(text) as unknown;
}

describe("buildFixtureFiles", () => {
  const result = buildFixtureFiles(syntheticInput());
  const { files, manifest } = result;

  it("writes the layout the MSW handlers expect", () => {
    const paths = [...files.keys()].sort();
    expect(paths).toEqual(
      [
        "manifest.json",
        "projections/2026/1.json",
        "projections/2026/2.json",
        "projections/2026/3.json",
        "stats/2026/1.json",
        "stats/2026/2.json",
        "v1/draft/1000000000000001001/picks.json",
        "v1/league/1000000000000000001.json",
        "v1/league/1000000000000000001/drafts.json",
        "v1/league/1000000000000000001/losers_bracket.json",
        "v1/league/1000000000000000001/matchups/1.json",
        "v1/league/1000000000000000001/matchups/2.json",
        "v1/league/1000000000000000001/matchups/3.json",
        "v1/league/1000000000000000001/matchups/4.json",
        "v1/league/1000000000000000001/rosters.json",
        "v1/league/1000000000000000001/traded_picks.json",
        "v1/league/1000000000000000001/transactions/1.json",
        "v1/league/1000000000000000001/transactions/2.json",
        "v1/league/1000000000000000001/users.json",
        "v1/league/1000000000000000001/winners_bracket.json",
        "v1/players/nfl.json",
        "v1/players/nfl/trending/add.json",
        "v1/players/nfl/trending/drop.json",
        "v1/state/nfl.json",
        "v1/user/100000000000000002/leagues/nfl/2026.json",
        "v1/user/manager_02.json",
      ].sort(),
    );
  });

  it("is deterministic: building twice gives identical bytes", () => {
    const again = buildFixtureFiles(syntheticInput());
    expect([...again.files]).toEqual([...files]);
  });

  it("writes a manifest with weeks, partial weeks and future matchup weeks", () => {
    expect(manifest).toMatchObject({
      leagueId: "1000000000000000001",
      season: "2026",
      currentWeek: 3,
      weeks: [1, 2],
      partialWeeks: [3],
      futureMatchupWeeks: [4],
      projectionWeeks: [1, 2, 3],
      statsWeeks: [1, 2],
      recordedAt: "2026-10-01T12:00:00.000Z",
      sanitizerVersion: 1,
      username: "manager_02",
      userId: "100000000000000002",
    });
    expect(json(files, "manifest.json")).toEqual(JSON.parse(JSON.stringify(manifest)));
  });

  it("trims players to referenced, top ranked and DEF, minus name collisions", () => {
    const players = json(files, "v1/players/nfl.json") as Record<string, Record<string, unknown>>;
    expect(Object.keys(players).sort()).toEqual(
      ["1001", "1002", "1003", "1004", "1005", "1006", "1007", "ATL", "BAL"].sort(),
    );
    expect(players["1008"]).toBeUndefined(); // named like a real team, unreferenced
    expect(players["1002"]?.college).toBeUndefined();
    const trimming = manifest.trimming as { players: { excludedForNameCollision: number } };
    expect(trimming.players.excludedForNameCollision).toBe(1);
  });

  it("keeps real rows, leaked positions and a placeholder sample in projections and stats", () => {
    const rows = json(files, "projections/2026/1.json") as { player_id: string }[];
    expect(rows.map((r) => r.player_id)).toEqual(["1002", "1004", "1005", "1006", "1007", "ATL"]);
    const trimming = manifest.trimming as { rows: { perWeek: Record<string, { real: number }> } };
    expect(trimming.rows.perWeek["projections/2026/1"]?.real).toBe(2);
  });

  it("uses one row per line for large collections", () => {
    const text = files.get("projections/2026/1.json") ?? "";
    expect(text.split("\n").length).toBe(6 + 3);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("refuses to return files that contain an original identifier", () => {
    const input = syntheticInput();
    // The state document is not sanitized, so an id planted there must be caught by the final scan.
    const leaky = { ...input, state: { week: 3, season: "2026", motd: `see ${REAL.userA}` } };
    expect(() => buildFixtureFiles(leaky)).toThrow(/original identifiers/);
  });
});
