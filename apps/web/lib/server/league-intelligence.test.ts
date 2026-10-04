import { schema, type DbHandle } from "@sideline/db";
import { type LeagueIntelligenceResponse } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getLeagueIntelligence, type Lookup } from "./league-intelligence";
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

function ok(r: Lookup<LeagueIntelligenceResponse>): LeagueIntelligenceResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

/** A played-week team score (`matchups.points`); `readLeagueWeeklyScores` doesn't need pairing. */
function insertWeeklyScore(h: DbHandle, week: number, rosterId: number, points: number): void {
  h.db
    .insert(schema.matchups)
    .values({
      leagueId: "L1",
      week,
      rosterId,
      matchupId: null,
      startersJson: "[]",
      startersPointsJson: "[]",
      playersJson: "[]",
      playersPointsJson: "{}",
      points,
    })
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

/** Projects every week from 5 (SEED_NOW's current week) through 18. */
function projectRestOfSeason(h: DbHandle, playerId: string, projPts: number): void {
  insertPoints(
    h,
    Array.from({ length: 14 }, (_, i) => ({ playerId, week: i + 5, projPts })),
  );
}

function insertTransaction(
  h: DbHandle,
  opts: {
    transactionId: string;
    week: number;
    type: string;
    status: string;
    rosterIds: number[];
    adds?: Record<string, number>;
    waiverBid?: number;
  },
): void {
  h.db
    .insert(schema.transactions)
    .values({
      leagueId: "L1",
      transactionId: opts.transactionId,
      week: opts.week,
      type: opts.type,
      status: opts.status,
      addsJson: opts.adds !== undefined ? JSON.stringify(opts.adds) : null,
      dropsJson: null,
      waiverBid: opts.waiverBid ?? null,
      rosterIdsJson: JSON.stringify(opts.rosterIds),
      creator: null,
      createdAt: 0,
      statusUpdatedAt: null,
    })
    .run();
}

function setPlayoffTeams(h: DbHandle, n: number): void {
  h.sqlite.prepare("UPDATE leagues SET playoff_teams = ? WHERE league_id = 'L1'").run(n);
}

function computedCacheRowCount(h: DbHandle, kind: string): number {
  return (
    h.sqlite.prepare("SELECT COUNT(*) AS n FROM computed_cache WHERE kind = ?").get(kind) as {
      n: number;
    }
  ).n;
}

describe("getLeagueIntelligence", () => {
  it("is not_found for a nonexistent league", () => {
    const h = setup();
    expect(getLeagueIntelligence(h, "nope", SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("a team that keeps winning despite a low all-play win rate shows positive luck (AC1)", () => {
    // 4 rosters, weeks 1-4 played (SEED_NOW's nfl state week is 5). Roster 1 always scores lowest
    // (all-play win rate 0 every week) but its real record (set directly, as Sleeper would report
    // it) is a perfect 4-0 - a "lucky" team that keeps winning close real games against an even
    // weaker scheduled opponent each week, something all-play (which ignores the real schedule)
    // never credits it for.
    const h = setup({ rosterCount: 4 });
    for (let week = 1; week <= 4; week += 1) {
      insertWeeklyScore(h, week, 1, 10);
      insertWeeklyScore(h, week, 2, 20);
      insertWeeklyScore(h, week, 3, 30);
      insertWeeklyScore(h, week, 4, 40);
    }
    h.sqlite
      .prepare("UPDATE rosters SET wins = 4, losses = 0 WHERE league_id = 'L1' AND roster_id = 1")
      .run();

    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    const team1 = data.teams.find((t) => t.rosterId === 1);
    expect(team1).toBeDefined();
    // Roster 1 lost every all-play comparison every week: its win rate reflects that low level of
    // actual-performance (schedule-neutral), even though its real record is 4-0.
    expect(team1?.allPlay.winRate).toBe(0);
    expect(team1?.luck.actualWins).toBe(4);
    expect(team1?.luck.expectedWins).toBe(0);
    expect(team1?.luck.luck).toBeGreaterThan(0);
  });

  it("power score ranks a team best in every component above one worst in every component (AC2)", () => {
    const h = setup({ rosterCount: 2, rosterSize: 8, playerCount: 16 });
    // All-play: roster 1 outscores roster 2 every played week (1-4).
    for (let week = 1; week <= 4; week += 1) {
      insertWeeklyScore(h, week, 1, 50);
      insertWeeklyScore(h, week, 2, 10);
    }
    // Roster strength: roster 1's players project strongly for the rest of the season; roster 2's
    // project weakly.
    for (let n = 1; n <= 8; n += 1) projectRestOfSeason(h, `p${n}`, 20);
    for (let n = 9; n <= 16; n += 1) projectRestOfSeason(h, `p${n}`, 2);

    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    const team1 = data.teams.find((t) => t.rosterId === 1);
    const team2 = data.teams.find((t) => t.rosterId === 2);
    expect(team1).toBeDefined();
    expect(team2).toBeDefined();
    expect(team1?.powerScore.allPlayWinRate).toBe(1);
    expect(team2?.powerScore.allPlayWinRate).toBe(0);
    expect(team1?.powerScore.recentPointsForNormalized).toBe(1);
    expect(team2?.powerScore.recentPointsForNormalized).toBe(0);
    expect(team1?.powerScore.rosterStrengthNormalized).toBe(1);
    expect(team2?.powerScore.rosterStrengthNormalized).toBe(0);
    expect(team1?.powerScore.score ?? 0).toBeGreaterThan(team2?.powerScore.score ?? 0);
  });

  it("positional heatmap: a stronger team's delta/ratio reflect the real league median (AC3)", () => {
    const h = setup({ rosterCount: 2, rosterSize: 8, playerCount: 16 });
    for (let n = 1; n <= 8; n += 1) projectRestOfSeason(h, `p${n}`, 20);
    for (let n = 9; n <= 16; n += 1) projectRestOfSeason(h, `p${n}`, 2);

    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    expect(data.positionalHeatmap.length).toBeGreaterThan(0);
    const byPosition = new Map<string, typeof data.positionalHeatmap>();
    for (const entry of data.positionalHeatmap) {
      const arr = byPosition.get(entry.position) ?? [];
      arr.push(entry);
      byPosition.set(entry.position, arr);
    }
    let checked = 0;
    for (const entries of byPosition.values()) {
      expect(entries).toHaveLength(2);
      const team1Entry = entries.find((e) => e.rosterId === 1);
      const team2Entry = entries.find((e) => e.rosterId === 2);
      expect(team1Entry).toBeDefined();
      expect(team2Entry).toBeDefined();
      if (team1Entry === undefined || team2Entry === undefined) continue;
      const expectedMedian = (team1Entry.value + team2Entry.value) / 2;
      expect(team1Entry.median).toBeCloseTo(expectedMedian, 6);
      expect(team1Entry.delta).toBeCloseTo(team1Entry.value - expectedMedian, 6);
      if (team1Entry.value > team2Entry.value && expectedMedian > 0) {
        expect(team1Entry.delta).toBeGreaterThan(0);
        expect(team1Entry.ratio ?? 0).toBeGreaterThan(1);
        checked += 1;
      }
    }
    // Roster 1's optimal lineup is strictly stronger at every position with a nonzero median
    // (every slot eligible for its 20pt players is filled before any of roster 2's 2pt players).
    expect(checked).toBeGreaterThan(0);
  });

  it("sum of playoffPct across all teams is within 0.5% of playoffTeams (AC4)", () => {
    const h = setup({ rosterCount: 4 });
    setPlayoffTeams(h, 2);
    // No future matchups rows at all: simulatePlayoffOdds's zero-remaining-games branch ranks the
    // current standings once, deterministically - still satisfies the exact sum invariant.
    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    expect(data.playoffTeams).toBe(2);
    const sum = data.teams.reduce((acc, t) => acc + (t.playoffOdds?.playoffPct ?? 0), 0);
    expect(Math.abs(sum - 2)).toBeLessThanOrEqual(0.01);
    for (const t of data.teams) expect(t.playoffOdds?.byePct ?? null).toBeNull();
  });

  it("returns null playoffOdds for every team when playoffTeams is unknown", () => {
    const h = setup({ rosterCount: 4 });
    // Test-seed never sets playoff_teams; it stays null.
    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    for (const t of data.teams) expect(t.playoffOdds).toBeNull();
    expect(data.playoffTeams).toBeNull();
  });

  it("manager tendencies: FAAB fields are null in a non-FAAB league, and a failed transaction is excluded (AC5)", () => {
    const h = setup({ rosterCount: 4 });
    // Test-seed's default waiver_mode is "unknown" (non-FAAB).
    insertTransaction(h, {
      transactionId: "t-complete",
      week: 3,
      type: "trade",
      status: "complete",
      rosterIds: [1, 2],
    });
    insertTransaction(h, {
      transactionId: "t-failed",
      week: 4,
      type: "trade",
      status: "failed",
      rosterIds: [1, 2],
    });

    const data = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    const team1 = data.teams.find((t) => t.rosterId === 1);
    expect(team1).toBeDefined();
    expect(team1?.managerTendencies.tradeCount).toBe(1);
    expect(team1?.managerTendencies.transactionCount).toBe(1);
    for (const t of data.teams) {
      expect(t.managerTendencies.faabSpent).toBeNull();
      expect(t.managerTendencies.faabRemaining).toBeNull();
      expect(t.managerTendencies.faabAverageWinningBid).toBeNull();
      expect(t.managerTendencies.faabMaxWinningBid).toBeNull();
    }
  });

  it("caches the whole-league computation: a second call does not add another computed_cache row", () => {
    const h = setup({ rosterCount: 4 });
    expect(computedCacheRowCount(h, "league-intelligence")).toBe(0);
    const first = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    expect(computedCacheRowCount(h, "league-intelligence")).toBe(1);
    const second = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    expect(computedCacheRowCount(h, "league-intelligence")).toBe(1);
    expect(second).toEqual(first);
  });

  it("invalidates the cache when a relevant sync job succeeds", () => {
    const h = setup({ rosterCount: 4 });
    const first = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    h.sqlite
      .prepare("UPDATE rosters SET fpts = 999 WHERE league_id = 'L1' AND roster_id = 1")
      .run();
    const second = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    expect(second).toEqual(first); // same inputs hash: stale value returned (cache hit)

    const later = new Date(SEED_NOW.getTime() + 1000);
    h.sqlite
      .prepare(
        "INSERT INTO sync_runs (job, started_at, finished_at, status) VALUES ('rosters', ?, ?, 'success')",
      )
      .run("2026-10-02T11:00:00.000Z", "2026-10-02T11:30:00.000Z");
    const third = ok(getLeagueIntelligence(h, "L1", later));
    expect(third).not.toEqual(first);
  });
});
