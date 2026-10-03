import { schema, type DbHandle } from "@sideline/db";
import { LineupResponseSchema, type LineupResponse } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getLineup, type Lookup } from "./lineup";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function setup(opts: Parameters<typeof seedLeague>[1] = {}): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, opts);
  return h;
}

function ok(r: Lookup<LineupResponse>): LineupResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

function insertPoints(
  h: DbHandle,
  rows: { playerId: string; week: number; projPts?: number; actualPts?: number }[],
): void {
  for (const r of rows) {
    h.db
      .insert(schema.leaguePlayerWeekPoints)
      .values({
        leagueId: "L1",
        season: 2026,
        week: r.week,
        playerId: r.playerId,
        ...(r.projPts !== undefined ? { projPts: r.projPts } : {}),
        ...(r.actualPts !== undefined ? { actualPts: r.actualPts } : {}),
      })
      .run();
  }
}

describe("getLineup", () => {
  it("assembles a full realistic roster into a valid response", () => {
    const h = setup({ rosterCount: 4, rosterSize: 8, playerCount: 60 });
    insertPoints(
      h,
      Array.from({ length: 8 }, (_, i) => ({
        playerId: `p${i + 1}`,
        week: 5,
        projPts: (i + 1) * 5,
      })),
    );
    const data = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    expect(LineupResponseSchema.safeParse(data).success).toBe(true);
    expect(data.players).toHaveLength(8);
    expect(data.optimalAssignment.map((a) => a.slotType)).toEqual(["QB", "RB", "WR", "TE", "FLEX"]);
    expect(data.currentAssignment).toHaveLength(5);
  });

  it("is not_found for an unknown league, and for an explicit roster that does not exist", () => {
    const h = setup();
    expect(getLineup(h, "nope", { mode: "projected", rosterId: 1 }, SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(getLineup(h, "L1", { mode: "projected", rosterId: 999 }, SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("treats a missing league_player_week_points row as projPts 0", () => {
    const h = setup({ rosterCount: 1 });
    insertPoints(h, [{ playerId: "p2", week: 5, projPts: 12 }]);
    const data = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    expect(data.players.find((p) => p.playerId === "p1")?.value).toBe(0);
    expect(data.players.find((p) => p.playerId === "p2")?.value).toBe(12);
  });

  it("safe and upside modes differ from projected for a player with real variance", () => {
    const h = setup({ rosterCount: 1 });
    insertPoints(h, [
      { playerId: "p1", week: 1, actualPts: 2 },
      { playerId: "p1", week: 2, actualPts: 2 },
      { playerId: "p1", week: 3, actualPts: 30 },
      { playerId: "p1", week: 4, actualPts: 2 },
      { playerId: "p1", week: 5, projPts: 10 },
    ]);
    const projected = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    const safe = ok(getLineup(h, "L1", { mode: "safe", rosterId: 1 }, SEED_NOW));
    const upside = ok(getLineup(h, "L1", { mode: "upside", rosterId: 1 }, SEED_NOW));
    const valueOf = (r: LineupResponse): number | undefined =>
      r.players.find((p) => p.playerId === "p1")?.value;
    expect(valueOf(projected)).toBe(10);
    expect(valueOf(safe)).toBeLessThan(10);
    expect(valueOf(upside)).toBeGreaterThan(10);
  });

  it("position CV prior averages each player's own week-to-week CV, not a between-player pooled CV (regression, T3.8a)", () => {
    // Realistic shape: one star RB with a modest own week-to-week CV (~0.15), four deep-bench
    // RBs with their own CV (~0.2 each), and a separate low-sample RB with only 1 week of their
    // own history. The old implementation pooled every player's weekly points into one flat list
    // before computing sd/mean, conflating "which player is this" (star vs bench, mean 20 vs
    // mean 1.5) with "how much does one player vary week to week" - producing a pooled CV
    // (~1.4 for this fixture) so large it collapsed the low-sample player's Safe floor to exactly
    // 0 via `floorAndCeiling`'s `Math.max(0, ...)`. Averaging each qualifying player's own CV
    // instead produces a realistic prior (~0.19) and a non-zero floor.
    const h = setup({ rosterCount: 1, rosterSize: 21, playerCount: 21 });
    insertPoints(h, [
      // Star RB (p1): mean 20, own population sd 3 -> own CV 0.15.
      { playerId: "p1", week: 1, actualPts: 17 },
      { playerId: "p1", week: 2, actualPts: 23 },
      { playerId: "p1", week: 3, actualPts: 17 },
      { playerId: "p1", week: 4, actualPts: 23 },
      { playerId: "p1", week: 5, actualPts: 17 },
      { playerId: "p1", week: 6, actualPts: 23 },
      // Four deep-bench RBs (p5, p9, p13, p17): mean 1.5, own population sd 0.3 -> own CV 0.2 each.
      ...["p5", "p9", "p13", "p17"].flatMap((playerId) => [
        { playerId, week: 1, actualPts: 1.2 },
        { playerId, week: 2, actualPts: 1.8 },
        { playerId, week: 3, actualPts: 1.2 },
        { playerId, week: 4, actualPts: 1.8 },
        { playerId, week: 5, actualPts: 1.2 },
        { playerId, week: 6, actualPts: 1.8 },
      ]),
      // Low-sample RB under test (p21): only 1 week of their own history, below
      // MIN_WEEKS_FOR_PLAYER_CV, so this player does not contribute to the position average
      // either way; only the shrinkage formula's reliance on the prior is under test.
      { playerId: "p21", week: 4, actualPts: 3 },
      { playerId: "p21", week: 5, projPts: 15 },
    ]);
    const safe = ok(getLineup(h, "L1", { mode: "safe", rosterId: 1 }, SEED_NOW));
    const floor = safe.players.find((p) => p.playerId === "p21")?.value;
    expect(floor).toBeGreaterThan(5);
  });

  it("position CV prior is usable at realistic week-4 sample sizes, not just at 6+ weeks (regression, follow-up to T3.8a/352af52)", () => {
    // Realistic week-4 shape: three RBs (p1, p5, p9) each with only 2-3 of their own weeks so
    // far (the most any player can have by week 4), differing week to week so each has a real
    // nonzero own CV. A fourth RB (p13) under test has NO actual_pts history at all (a brand-new
    // or untouched bench player), so their own sdPlayer is 0 and their Safe/Upside separation
    // depends entirely on the position CV prior. Under the old MIN_WEEKS_FOR_PLAYER_CV = 4, none
    // of p1/p5/p9 would qualify (all have fewer than 4 of their own weeks), the position CV map
    // would be empty, and p13's floor/ceiling would collapse to exactly their projection.
    const h = setup({ rosterCount: 1, rosterSize: 16, playerCount: 16 });
    insertPoints(h, [
      // p1: 2 weeks, mean 12, own CV ~0.167.
      { playerId: "p1", week: 1, actualPts: 10 },
      { playerId: "p1", week: 2, actualPts: 14 },
      // p5: 2 weeks, mean 6, own CV ~0.167.
      { playerId: "p5", week: 1, actualPts: 5 },
      { playerId: "p5", week: 2, actualPts: 7 },
      // p9: 3 weeks, mean 4, own CV ~0.204.
      { playerId: "p9", week: 1, actualPts: 3 },
      { playerId: "p9", week: 2, actualPts: 5 },
      { playerId: "p9", week: 3, actualPts: 4 },
      // p13 under test: no actual_pts at all, only a week 5 projection.
      { playerId: "p13", week: 5, projPts: 20 },
    ]);
    const projected = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    const safe = ok(getLineup(h, "L1", { mode: "safe", rosterId: 1 }, SEED_NOW));
    const upside = ok(getLineup(h, "L1", { mode: "upside", rosterId: 1 }, SEED_NOW));
    const valueOf = (r: LineupResponse): number | undefined =>
      r.players.find((p) => p.playerId === "p13")?.value;
    expect(valueOf(projected)).toBe(20);
    expect(valueOf(safe)).toBeLessThan(20);
    expect(valueOf(upside)).toBeGreaterThan(20);
  });

  it("keeps a locked starter in their slot even when a higher-value player is eligible", () => {
    const h = setup({
      rosterCount: 1,
      rosterSize: 4,
      playerCount: 4,
      rosterPositions: ["QB", "BN", "BN", "BN"],
    });
    h.sqlite
      .prepare(
        `UPDATE players SET position = 'QB', fantasy_positions_json = '["QB"]', team = 'T02'
         WHERE player_id = 'p1'`,
      )
      .run();
    h.sqlite
      .prepare(
        `UPDATE players SET position = 'QB', fantasy_positions_json = '["QB"]', team = 'T03'
         WHERE player_id = 'p2'`,
      )
      .run();
    h.sqlite
      .prepare(
        `INSERT INTO schedule (season, week, game_id, game_type, home, away, kickoff_utc)
         VALUES (2026, 5, 'g1', 'REG', 'T02', 'T99', '2026-10-01T00:00:00.000Z')`,
      )
      .run();
    insertPoints(h, [
      { playerId: "p1", week: 5, projPts: 10 },
      { playerId: "p2", week: 5, projPts: 20 },
    ]);
    const data = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    expect(data.optimalAssignment).toEqual([{ slotType: "QB", playerId: "p1" }]);
    expect(data.swaps).toEqual([]);
    const p1 = data.players.find((p) => p.playerId === "p1");
    expect(p1?.locked).toBe(true);
    expect(p1?.reasons.some((r) => r.code === "LOCKED")).toBe(true);
    expect(data.players.find((p) => p.playerId === "p2")?.locked).toBe(false);
  });

  it("keeps currentAssignment aligned with slots when an unknown slot type is dropped (bug fix)", () => {
    // roster_positions has an unrecognized middle slot. Sleeper's starters array still has one
    // entry per non-bench slot (3), but resolveSlots drops the unknown one, keeping only QB and
    // RB (2 slots). Before the fix, currentAssignment was built straight from starters_json with
    // no re-filtering, so slot index 1 (RB) would have seen p2 (the real UNKNOWN_SLOT starter)
    // instead of p3 (the real RB starter) - an off-by-one past the dropped slot.
    const h = setup({
      rosterCount: 1,
      rosterSize: 3,
      playerCount: 3,
      rosterPositions: ["QB", "UNKNOWN_SLOT", "RB"],
    });
    h.sqlite
      .prepare(
        `UPDATE players SET position = 'QB', fantasy_positions_json = '["QB"]' WHERE player_id = 'p1'`,
      )
      .run();
    h.sqlite
      .prepare(
        `UPDATE players SET position = 'RB', fantasy_positions_json = '["RB"]' WHERE player_id = 'p3'`,
      )
      .run();
    const data = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
    expect(data.currentAssignment).toEqual([
      { slotType: "QB", playerId: "p1" },
      { slotType: "RB", playerId: "p3" },
    ]);
    expect(data.issues).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_SLOT_TYPE", value: "UNKNOWN_SLOT" }),
    );
  });

  it("resolves the opponent roster from the matchups table, and null without one", () => {
    const h = setup({ rosterCount: 3 });
    h.db
      .insert(schema.matchups)
      .values([
        {
          leagueId: "L1",
          week: 5,
          rosterId: 1,
          matchupId: 1,
          startersJson: "[]",
          playersJson: "[]",
          playersPointsJson: "{}",
          points: 0,
        },
        {
          leagueId: "L1",
          week: 5,
          rosterId: 2,
          matchupId: 1,
          startersJson: "[]",
          playersJson: "[]",
          playersPointsJson: "{}",
          points: 0,
        },
      ])
      .run();
    expect(
      ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW)).opponentRosterId,
    ).toBe(2);
    expect(
      ok(getLineup(h, "L1", { mode: "projected", rosterId: 3 }, SEED_NOW)).opponentRosterId,
    ).toBe(null);
  });

  describe("caching", () => {
    it("hits the cache for identical inputs, and misses once a relevant sync job succeeds", () => {
      const h = setup({ rosterCount: 1 });
      insertPoints(h, [{ playerId: "p1", week: 5, projPts: 10 }]);
      const first = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
      expect(first.players.find((p) => p.playerId === "p1")?.value).toBe(10);

      // Mutate the underlying data without a sync success: lastSuccessAt is unchanged, so the
      // inputs hash is unchanged, so this should be a cache hit returning the stale value.
      h.sqlite
        .prepare("UPDATE league_player_week_points SET proj_pts = 50 WHERE player_id = 'p1'")
        .run();
      const second = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
      expect(second).toEqual(first);
      expect(second.players.find((p) => p.playerId === "p1")?.value).toBe(10);

      // A relevant sync success changes lastSuccessAt("stats"), changing the inputs hash: a
      // fresh computation now picks up the mutated value.
      h.sqlite
        .prepare(
          "INSERT INTO sync_runs (job, started_at, finished_at, status) VALUES ('stats', ?, ?, 'success')",
        )
        .run("2026-10-02T11:00:00.000Z", "2026-10-02T11:30:00.000Z");
      const third = ok(getLineup(h, "L1", { mode: "projected", rosterId: 1 }, SEED_NOW));
      expect(third.players.find((p) => p.playerId === "p1")?.value).toBe(50);
    });
  });
});
