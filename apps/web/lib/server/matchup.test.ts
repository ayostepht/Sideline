import { schema, setSleeperUserId, type DbHandle } from "@sideline/db";
import { MatchupResponseSchema, type MatchupResponse } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getMatchup, type Lookup } from "./matchup";
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

function ok(r: Lookup<MatchupResponse>): MatchupResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

function pairMatchup(h: DbHandle, week: number, rosterIdA: number, rosterIdB: number): void {
  h.db
    .insert(schema.matchups)
    .values([
      {
        leagueId: "L1",
        week,
        rosterId: rosterIdA,
        matchupId: 1,
        startersJson: "[]",
        playersJson: "[]",
        playersPointsJson: "{}",
        points: 0,
      },
      {
        leagueId: "L1",
        week,
        rosterId: rosterIdB,
        matchupId: 1,
        startersJson: "[]",
        playersJson: "[]",
        playersPointsJson: "{}",
        points: 0,
      },
    ])
    .run();
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

describe("getMatchup", () => {
  it("returns sane win probabilities and ordered score quantiles for a real two-team matchup", () => {
    // rosterCount 2, rosterSize 8, default roster_positions give 5 starters per team: p1-p5 on
    // roster 1, p9-p13 on roster 2.
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    insertPoints(h, [
      ...Array.from({ length: 5 }, (_, i) => ({ playerId: `p${i + 1}`, week: 5, projPts: 10 + i })),
      ...Array.from({ length: 5 }, (_, i) => ({ playerId: `p${i + 9}`, week: 5, projPts: 8 + i })),
      // Give each starter some history so weeklyStandardDeviation produces a real sd.
      ...["p1", "p2", "p9", "p10"].flatMap((playerId) => [
        { playerId, week: 1, actualPts: 8 },
        { playerId, week: 2, actualPts: 12 },
        { playerId, week: 3, actualPts: 9 },
      ]),
    ]);
    const data = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(MatchupResponseSchema.safeParse(data).success).toBe(true);
    const totalProb = data.winProbability + data.opponentWinProbability + data.tieProbability;
    expect(totalProb).toBeCloseTo(1, 9);
    expect(data.team.p10).toBeLessThanOrEqual(data.team.p50);
    expect(data.team.p50).toBeLessThanOrEqual(data.team.p90);
    expect(data.opponent.p10).toBeLessThanOrEqual(data.opponent.p50);
    expect(data.opponent.p50).toBeLessThanOrEqual(data.opponent.p90);
    expect(data.team.rosterId).toBe(1);
    expect(data.opponent.rosterId).toBe(2);
    expect(data.swingPlayers.length).toBeGreaterThan(0);
  });

  it("is deterministic: a fresh recomputation from identical inputs matches the first result exactly", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    insertPoints(h, [
      { playerId: "p1", week: 5, projPts: 15 },
      { playerId: "p9", week: 5, projPts: 12 },
    ]);
    const first = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
    // Force a fresh computation (bypassing the cache row written by the first call) rather than
    // changing any real input, so this isolates simulateMatchup's own determinism given the same
    // derived seed and starter inputs.
    h.sqlite.prepare("DELETE FROM computed_cache").run();
    const second = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(second).toEqual(first);
  });

  it("a finished player (recorded stats for the requested week) contributes zero variance, not a drawn value", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    insertPoints(h, [
      // Every one of roster 1's starters (p1-p5) is finished this week.
      ...Array.from({ length: 5 }, (_, i) => ({ playerId: `p${i + 1}`, week: 5, actualPts: 10 })),
      // Roster 2's starters (p9-p13) are not_started, with real variance from history.
      ...Array.from({ length: 5 }, (_, i) => ({ playerId: `p${i + 9}`, week: 5, projPts: 8 + i })),
      { playerId: "p9", week: 1, actualPts: 2 },
      { playerId: "p9", week: 2, actualPts: 20 },
      { playerId: "p9", week: 3, actualPts: 2 },
    ]);
    const data = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
    // All of roster 1's points are fixed actuals summing to 50, so their score has zero variance
    // across every simulated iteration.
    expect(data.team.p10).toBe(50);
    expect(data.team.p50).toBe(50);
    expect(data.team.p90).toBe(50);
    const rosterOneSwings = data.swingPlayers.filter((s) => s.rosterId === 1);
    expect(rosterOneSwings.length).toBe(5);
    for (const s of rosterOneSwings) expect(s.varianceContribution).toBe(0);
  });

  it("a starter whose NFL team is on a bye this week contributes exactly 0, not a nonzero draw (Major fix round)", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    // Full 18-week schedule so readByeWeeks's "all 18 weeks loaded" guard is satisfied. Two
    // filler teams (T90/T91) play every week so every week number 1-18 is present at all; T01
    // (p1's team, below) plays T99 every week except week 5, making week 5 T01's bye.
    for (let w = 1; w <= 18; w += 1) {
      h.db
        .insert(schema.schedule)
        .values({
          season: 2026,
          week: w,
          gameId: `filler-${w}`,
          gameType: "REG",
          home: "T90",
          away: "T91",
        })
        .run();
      if (w !== 5) {
        h.db
          .insert(schema.schedule)
          .values({
            season: 2026,
            week: w,
            gameId: `bye-${w}`,
            gameType: "REG",
            home: "T01",
            away: "T99",
          })
          .run();
      }
    }
    // p1 (roster 1's starter) is on team T01, byed in week 5. p1 also has pre-bye weekly history
    // with real spread, so a pre-fix caller would compute a nonzero sd for them despite the bye.
    h.sqlite.prepare(`UPDATE players SET team = 'T01' WHERE player_id = 'p1'`).run();
    insertPoints(h, [
      { playerId: "p1", week: 1, actualPts: 2 },
      { playerId: "p1", week: 2, actualPts: 20 },
      { playerId: "p1", week: 3, actualPts: 2 },
      // p1 has no week-5 points at all (no stats row, as expected for a byed player this week).
      // Roster 1's other starters (p2-p5) are finished this week with a fixed total, so roster
      // 1's whole score is deterministic if and only if p1 truly contributes 0.
      ...Array.from({ length: 4 }, (_, i) => ({ playerId: `p${i + 2}`, week: 5, actualPts: 10 })),
      // Opponent (p9-p13) not_started, with real variance from history.
      ...Array.from({ length: 5 }, (_, i) => ({ playerId: `p${i + 9}`, week: 5, projPts: 8 + i })),
      { playerId: "p9", week: 1, actualPts: 2 },
      { playerId: "p9", week: 2, actualPts: 20 },
      { playerId: "p9", week: 3, actualPts: 2 },
    ]);
    const data = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
    // p1 contributes 0 and p2-p5 contribute a fixed 40 total, every simulated iteration.
    expect(data.team.p10).toBe(40);
    expect(data.team.p50).toBe(40);
    expect(data.team.p90).toBe(40);
    const p1Swing = data.swingPlayers.find((s) => s.playerId === "p1");
    expect(p1Swing).toBeDefined();
    expect(p1Swing?.varianceContribution).toBe(0);
  });

  it("returns a clean no_opponent failure for a roster with no matchup this week (bye), not a thrown error", () => {
    const h = setup({ rosterCount: 2 });
    // No matchups rows inserted at all.
    expect(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW)).toEqual({
      ok: false,
      reason: "no_opponent",
    });
  });

  it("not_found for an unknown league, and for an explicit roster that does not exist", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    expect(getMatchup(h, "nope", { rosterId: 1 }, SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(getMatchup(h, "L1", { rosterId: 999 }, SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("resolves 'my' roster from the stored Sleeper user when rosterId is omitted", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    setSleeperUserId(h, "u1"); // seedLeague owns roster 1 with u1
    const data = ok(getMatchup(h, "L1", {}, SEED_NOW));
    expect(data.team.rosterId).toBe(1);
    expect(data.opponent.rosterId).toBe(2);
  });

  it("no_team when rosterId is omitted and no user is stored, or the stored user owns no roster", () => {
    const h = setup({ rosterCount: 2 });
    pairMatchup(h, 5, 1, 2);
    expect(getMatchup(h, "L1", {}, SEED_NOW)).toEqual({ ok: false, reason: "no_team" });
    setSleeperUserId(h, "stranger");
    expect(getMatchup(h, "L1", {}, SEED_NOW)).toEqual({ ok: false, reason: "no_team" });
  });

  describe("caching", () => {
    it("hits the cache for identical inputs, and misses once a relevant sync job succeeds", () => {
      const h = setup({ rosterCount: 2 });
      pairMatchup(h, 5, 1, 2);
      insertPoints(h, [
        { playerId: "p1", week: 5, projPts: 10 },
        { playerId: "p9", week: 5, projPts: 8 },
      ]);
      const first = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
      const cachedRow = h.sqlite
        .prepare("SELECT COUNT(*) AS n FROM computed_cache WHERE kind = 'matchup-sim:1'")
        .get() as { n: number };
      expect(cachedRow.n).toBe(1);

      // Mutate the underlying data without a sync success: lastSuccessAt is unchanged, so the
      // inputs hash is unchanged, so this should be a cache hit returning the stale value.
      h.sqlite
        .prepare("UPDATE league_player_week_points SET proj_pts = 90 WHERE player_id = 'p1'")
        .run();
      const second = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
      expect(second).toEqual(first);

      // A relevant sync success changes lastSuccessAt("projections"), changing the inputs hash: a
      // fresh computation now picks up the mutated value.
      h.sqlite
        .prepare(
          "INSERT INTO sync_runs (job, started_at, finished_at, status) VALUES ('projections', ?, ?, 'success')",
        )
        .run("2026-10-02T11:00:00.000Z", "2026-10-02T11:30:00.000Z");
      const third = ok(getMatchup(h, "L1", { rosterId: 1 }, SEED_NOW));
      expect(third).not.toEqual(first);
    });
  });
});
