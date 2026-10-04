import { finishRun, schema, startRun, type DbHandle } from "@sideline/db";
import { afterEach, describe, expect, it } from "vitest";
import { getRosterStrength, type Lookup, type RosterStrengthResult } from "./roster-strength";
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

function ok(r: Lookup<RosterStrengthResult[]>): RosterStrengthResult[] {
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

/** Projects every week from 5 (SEED_NOW's current week) through 18. */
function projectRestOfSeason(h: DbHandle, playerId: string, projPts: number): void {
  insertPoints(
    h,
    Array.from({ length: 14 }, (_, i) => ({ playerId, week: i + 5, projPts })),
  );
}

function computedCacheRowCount(h: DbHandle): number {
  return (h.sqlite.prepare("SELECT COUNT(*) AS n FROM computed_cache").get() as { n: number }).n;
}

describe("getRosterStrength", () => {
  it("is not_found for a nonexistent league", () => {
    const h = setup();
    expect(getRosterStrength(h, "nope", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns an empty array for a league with no rosters, not an error", () => {
    const h = setup({ rosterCount: 0 });
    expect(getRosterStrength(h, "L1", SEED_NOW)).toEqual({ ok: true, data: [] });
  });

  it("handles an empty roster without crashing: zero total, zeroed position buckets", () => {
    const h = setup({ rosterCount: 1, rosterSize: 0, playerCount: 0 });
    const data = ok(getRosterStrength(h, "L1", SEED_NOW));
    expect(data).toHaveLength(1);
    expect(data[0]?.rosOptimalTotal).toBe(0);
    expect(data[0]?.byPosition.every((p) => p.value === 0)).toBe(true);
    // Every fillable slot type from the default roster_positions is still present.
    expect(data[0]?.byPosition.map((p) => p.position).sort()).toEqual(
      ["FLEX", "QB", "RB", "TE", "WR"].sort(),
    );
  });

  it("a roster with strong remaining-week projections scores higher than one with weak projections", () => {
    const h = setup({ rosterCount: 2, rosterSize: 8, playerCount: 16 });
    // Roster 1 (p1..p8): strong ROS projections.
    for (let n = 1; n <= 8; n += 1) projectRestOfSeason(h, `p${n}`, 20);
    // Roster 2 (p9..p16): weak ROS projections.
    for (let n = 9; n <= 16; n += 1) projectRestOfSeason(h, `p${n}`, 2);

    const data = ok(getRosterStrength(h, "L1", SEED_NOW));
    const r1 = data.find((r) => r.rosterId === 1);
    const r2 = data.find((r) => r.rosterId === 2);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1?.rosOptimalTotal ?? 0).toBeGreaterThan(r2?.rosOptimalTotal ?? 0);
  });

  it("byPosition sums add up to rosOptimalTotal exactly", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    projectRestOfSeason(h, "p1", 18); // RB (n=1)
    projectRestOfSeason(h, "p2", 25); // WR (n=2)
    projectRestOfSeason(h, "p3", 10); // TE (n=3)
    projectRestOfSeason(h, "p4", 22); // QB (n=4)
    projectRestOfSeason(h, "p5", 15); // RB (n=5, flex-eligible)

    const data = ok(getRosterStrength(h, "L1", SEED_NOW));
    const r1 = data.find((r) => r.rosterId === 1);
    expect(r1).toBeDefined();
    const sum = r1?.byPosition.reduce((acc, p) => acc + p.value, 0) ?? 0;
    expect(sum).toBeCloseTo(r1?.rosOptimalTotal ?? -1, 6);
  });

  it("falls back to season PPG for a remaining week with no stored projection", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    // p1 (RB): no projections at all for weeks 5-18, but a season average of 10 from history.
    insertPoints(h, [
      { playerId: "p1", week: 1, actualPts: 8 },
      { playerId: "p1", week: 2, actualPts: 12 },
    ]);
    const data = ok(getRosterStrength(h, "L1", SEED_NOW));
    const r1 = data.find((r) => r.rosterId === 1);
    expect(r1).toBeDefined();
    // 14 remaining weeks (5..18) * season PPG of 10, at minimum contributed somewhere in the
    // optimal assignment (p1 is RB-eligible for RB or FLEX).
    expect(r1?.rosOptimalTotal ?? 0).toBeGreaterThan(0);
  });

  it("caches the whole-league computation: a second call does not add another computed_cache row", () => {
    const h = setup({ rosterCount: 2, rosterSize: 8, playerCount: 16 });
    for (let n = 1; n <= 8; n += 1) projectRestOfSeason(h, `p${n}`, 20);
    for (let n = 9; n <= 16; n += 1) projectRestOfSeason(h, `p${n}`, 2);

    expect(computedCacheRowCount(h)).toBe(0);
    const first = ok(getRosterStrength(h, "L1", SEED_NOW));
    expect(computedCacheRowCount(h)).toBe(1);
    const second = ok(getRosterStrength(h, "L1", SEED_NOW));
    expect(computedCacheRowCount(h)).toBe(1);
    expect(second).toEqual(first);
  });

  it("invalidates the cache when the underlying sync data changes", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    projectRestOfSeason(h, "p1", 10);
    const first = ok(getRosterStrength(h, "L1", SEED_NOW));
    projectRestOfSeason(h, "p2", 30); // a second roster player now has a projection
    const later = new Date(SEED_NOW.getTime() + 1000);
    const runId = startRun(h, "rosters", later);
    finishRun(h, runId, { status: "success", callsMade: 1, rowsChanged: 0, error: null }, later);
    const second = ok(getRosterStrength(h, "L1", later));
    expect(computedCacheRowCount(h)).toBe(2);
    expect(second[0]?.rosOptimalTotal).not.toBe(first[0]?.rosOptimalTotal);
  });
});
