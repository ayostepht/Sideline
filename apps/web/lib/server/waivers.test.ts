import { schema, type DbHandle } from "@sideline/db";
import { WaiverResponseSchema, type WaiverResponse } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getWaivers, percentiles, substituteNulls, type Lookup } from "./waivers";
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

function ok(r: Lookup<WaiverResponse>): WaiverResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

function setStatus(h: DbHandle, ids: string[], status: string): void {
  const marks = ids.map(() => "?").join(",");
  h.sqlite
    .prepare(`UPDATE players SET status = ? WHERE player_id IN (${marks})`)
    .run(status, ...ids);
}

function setWaiverPosition(
  h: DbHandle,
  leagueId: string,
  rosterId: number,
  position: number,
): void {
  h.sqlite
    .prepare(`UPDATE rosters SET waiver_position = ? WHERE league_id = ? AND roster_id = ?`)
    .run(position, leagueId, rosterId);
}

function setTaxi(h: DbHandle, leagueId: string, rosterId: number, ids: string[]): void {
  h.sqlite
    .prepare(`UPDATE rosters SET taxi_json = ? WHERE league_id = ? AND roster_id = ?`)
    .run(JSON.stringify(ids), leagueId, rosterId);
}

function setReserve(h: DbHandle, leagueId: string, rosterId: number, ids: string[]): void {
  h.sqlite
    .prepare(`UPDATE rosters SET reserve_json = ? WHERE league_id = ? AND roster_id = ?`)
    .run(JSON.stringify(ids), leagueId, rosterId);
}

function setWaiverMode(h: DbHandle, leagueId: string, mode: string): void {
  h.sqlite.prepare(`UPDATE leagues SET waiver_mode = ? WHERE league_id = ?`).run(mode, leagueId);
}

/** Inserts a flat `projPts` for `playerId` across every week in `weeks`. */
function insertProj(
  h: DbHandle,
  leagueId: string,
  season: number,
  playerId: string,
  weeks: readonly number[],
  projPts: number,
): void {
  for (const week of weeks) {
    h.db
      .insert(schema.leaguePlayerWeekPoints)
      .values({ leagueId, season, week, playerId, projPts })
      .run();
  }
}

const WEEKS_5_TO_18 = Array.from({ length: 14 }, (_, i) => i + 5);
const WEEKS_5_TO_7 = [5, 6, 7];

function computedCacheRowCount(h: DbHandle): number {
  return (h.sqlite.prepare("SELECT COUNT(*) AS n FROM computed_cache").get() as { n: number }).n;
}

describe("getWaivers", () => {
  it("is not_found for an unknown league", () => {
    const h = setup();
    expect(getWaivers(h, "nope", {}, SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns an empty candidate pool when every player is rostered", () => {
    const h = setup({
      rosterCount: 1,
      rosterSize: 4,
      playerCount: 4,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    const data = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(WaiverResponseSchema.safeParse(data).success).toBe(true);
    expect(data.candidatePoolSize).toBe(0);
    expect(data.forMyTeam).toEqual([]);
    expect(data.bestAvailable).toEqual([]);
    expect(data.poolReasons.some((r) => r.code === "EXCLUDED_ROSTERED")).toBe(true);
    expect(data.priorityAdvisor.applicable).toBe(true);
    expect(data.priorityAdvisor.order).toHaveLength(1);
  });

  it("ranks 'for my team' by Lineup Impact and 'best available' by rest-of-season value, differently", () => {
    const h = setup({
      rosterCount: 2,
      rosterSize: 4,
      playerCount: 10,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    // Team 1 (mine): p1 RB, p2 WR, p3 TE, p4 QB (seedLeague's position cycle).
    insertProj(h, "L1", 2026, "p4", WEEKS_5_TO_18, 10); // QB
    insertProj(h, "L1", 2026, "p1", WEEKS_5_TO_18, 8); // RB
    insertProj(h, "L1", 2026, "p2", WEEKS_5_TO_18, 15); // WR
    insertProj(h, "L1", 2026, "p3", WEEKS_5_TO_18, 5); // TE (lowest ROS: suggested drop)

    // Free agents: p9 (RB), p10 (WR).
    setStatus(h, ["p9", "p10"], "Active");
    // p9: huge near-term bump (great Lineup Impact), no production after week 7 (weak ROS).
    insertProj(h, "L1", 2026, "p9", WEEKS_5_TO_7, 20);
    // p10: modest but sustained production all season (strong ROS, but never beats my starting WR).
    insertProj(h, "L1", 2026, "p10", WEEKS_5_TO_18, 12);

    const data = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(data.candidatePoolSize).toBe(2);

    const p9 = data.forMyTeam.find((c) => c.playerId === "p9");
    const p10 = data.forMyTeam.find((c) => c.playerId === "p10");
    expect(p9).toBeDefined();
    expect(p10).toBeDefined();
    expect(p9?.lineupImpact).toBeGreaterThan(p10?.lineupImpact ?? 0);
    expect(p9?.suggestedDropPlayerId).toBe("p3");

    // "For my team": sorted by Lineup Impact descending -> p9 first.
    expect(data.forMyTeam.map((c) => c.playerId)).toEqual(["p9", "p10"]);
    // "Best available": sorted by rest-of-season value descending -> p10 first (sustained output).
    expect(data.bestAvailable.map((c) => c.playerId)).toEqual(["p10", "p9"]);
    expect(data.bestAvailable[0]?.rosValue).toBeGreaterThan(data.forMyTeam[0]?.rosValue ?? 0);
  });

  it("a position filter narrows both views to matching candidates", () => {
    const h = setup({
      rosterCount: 2,
      rosterSize: 4,
      playerCount: 10,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    insertProj(h, "L1", 2026, "p4", WEEKS_5_TO_18, 10);
    insertProj(h, "L1", 2026, "p1", WEEKS_5_TO_18, 8);
    insertProj(h, "L1", 2026, "p2", WEEKS_5_TO_18, 15);
    insertProj(h, "L1", 2026, "p3", WEEKS_5_TO_18, 5);
    setStatus(h, ["p9", "p10"], "Active");
    insertProj(h, "L1", 2026, "p9", WEEKS_5_TO_7, 20);
    insertProj(h, "L1", 2026, "p10", WEEKS_5_TO_18, 12);

    const data = ok(getWaivers(h, "L1", { rosterId: 1, positions: ["WR"] }, SEED_NOW));
    expect(data.forMyTeam.map((c) => c.playerId)).toEqual(["p10"]);
    expect(data.bestAvailable.map((c) => c.playerId)).toEqual(["p10"]);
  });

  it("flags a team ahead of me in the waiver order as a likely competing claim", () => {
    const h = setup({
      rosterCount: 3,
      rosterSize: 4,
      playerCount: 13,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    // My team (roster 1): p1 RB, p2 WR, p3 TE, p4 QB.
    insertProj(h, "L1", 2026, "p1", WEEKS_5_TO_18, 8);
    insertProj(h, "L1", 2026, "p2", WEEKS_5_TO_18, 10);
    insertProj(h, "L1", 2026, "p3", WEEKS_5_TO_18, 5);
    insertProj(h, "L1", 2026, "p4", WEEKS_5_TO_18, 10);
    // Team 2 (roster 2): p5 RB (weak - real need), p6 WR, p7 TE, p8 QB.
    insertProj(h, "L1", 2026, "p5", WEEKS_5_TO_18, 1);
    insertProj(h, "L1", 2026, "p6", WEEKS_5_TO_18, 10);
    insertProj(h, "L1", 2026, "p7", WEEKS_5_TO_18, 5);
    insertProj(h, "L1", 2026, "p8", WEEKS_5_TO_18, 10);
    // Team 3 (roster 3): p9 RB (already strong - behind me anyway, must not be evaluated).
    insertProj(h, "L1", 2026, "p9", WEEKS_5_TO_18, 20);
    insertProj(h, "L1", 2026, "p10", WEEKS_5_TO_18, 10);
    insertProj(h, "L1", 2026, "p11", WEEKS_5_TO_18, 5);
    insertProj(h, "L1", 2026, "p12", WEEKS_5_TO_18, 10);

    // Free agent candidate: p13, RB.
    setStatus(h, ["p13"], "Active");
    insertProj(h, "L1", 2026, "p13", WEEKS_5_TO_7, 20);

    // Waiver order: team 2 ahead of me, team 3 behind me.
    setWaiverPosition(h, "L1", 1, 2);
    setWaiverPosition(h, "L1", 2, 1);
    setWaiverPosition(h, "L1", 3, 3);

    const data = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(data.priorityAdvisor.myRank).toBe(2);
    const priorityForP13 = data.priorityAdvisor.candidates.find((c) => c.playerId === "p13");
    expect(priorityForP13).toBeDefined();
    expect(priorityForP13?.competingTeams).toHaveLength(1);
    expect(priorityForP13?.competingTeams[0]?.rosterId).toBe(2);
    expect(priorityForP13?.competingTeams[0]?.likelyCompeting).toBe(true);
    expect(priorityForP13?.competingTeams[0]?.aheadOfMe).toBe(true);
  });

  it("caches the computation: a second call does not add another computed_cache row", () => {
    const h = setup({
      rosterCount: 2,
      rosterSize: 4,
      playerCount: 10,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    setStatus(h, ["p9", "p10"], "Active");
    insertProj(h, "L1", 2026, "p9", WEEKS_5_TO_7, 20);
    insertProj(h, "L1", 2026, "p10", WEEKS_5_TO_18, 12);

    expect(computedCacheRowCount(h)).toBe(0);
    const first = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(computedCacheRowCount(h)).toBe(1);
    const second = ok(getWaivers(h, "L1", { rosterId: 1, positions: ["RB"] }, SEED_NOW));
    expect(computedCacheRowCount(h)).toBe(1);
    expect(second.candidatePoolSize).toBe(first.candidatePoolSize);
    // m1 fix: the in-memory position filter must actually apply post-cache-hit, not just leave the
    // cache row count unchanged.
    expect(second.forMyTeam.length).toBeGreaterThan(0);
    expect(second.forMyTeam.every((c) => c.position === "RB")).toBe(true);
    expect(second.bestAvailable.length).toBeGreaterThan(0);
    expect(second.bestAvailable.every((c) => c.position === "RB")).toBe(true);
  });

  it("M1 fix: a taxi-squad player is eligible for the auto-drop suggestion, an actual IR player is not", () => {
    const h = setup({
      rosterCount: 2,
      rosterSize: 5,
      playerCount: 13,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    // My team (roster 1): p1 RB, p2 WR, p3 TE, p4 QB (starters per seedLeague's position cycle),
    // p5 RB (5th roster player, not a starter).
    insertProj(h, "L1", 2026, "p1", WEEKS_5_TO_18, 8);
    insertProj(h, "L1", 2026, "p2", WEEKS_5_TO_18, 10);
    // p3 would be a high-value TE if it could play - it's on the taxi squad instead, so its
    // weekly/ROS values get zeroed (can't play), but (M1 fix) it stays eligible for auto-drop.
    insertProj(h, "L1", 2026, "p3", WEEKS_5_TO_18, 20);
    insertProj(h, "L1", 2026, "p4", WEEKS_5_TO_18, 10);
    // p5 is on actual IR: also zeroed, and (unlike taxi) still correctly excluded from auto-drop.
    insertProj(h, "L1", 2026, "p5", WEEKS_5_TO_18, 1);
    setTaxi(h, "L1", 1, ["p3"]);
    setReserve(h, "L1", 1, ["p5"]);

    // Free agent candidate: p11 (playerCount 13 with rosterCount 2 x rosterSize 5 rosters p1-p10).
    setStatus(h, ["p11"], "Active");
    insertProj(h, "L1", 2026, "p11", WEEKS_5_TO_7, 20);

    const data = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    const candidate = data.forMyTeam.find((c) => c.playerId === "p11");
    expect(candidate).toBeDefined();
    // The zeroed-out taxi player (p3, rosValue 0) is the actual lowest-ROS-value non-IR player, so
    // it's the suggested drop - not p1 (the lowest among starters alone, which is what the pre-fix
    // bug would have produced by wrongly excluding p3 as "isIR").
    expect(candidate?.suggestedDropPlayerId).toBe("p3");
  });

  it("M2 fix: a FAAB league reports priorityAdvisor.applicable === false with a FAAB_NOT_SUPPORTED reason", () => {
    const h = setup({
      rosterCount: 2,
      rosterSize: 4,
      playerCount: 10,
      rosterPositions: ["QB", "RB", "WR", "TE"],
    });
    setWaiverMode(h, "L1", "faab");
    setStatus(h, ["p9", "p10"], "Active");
    insertProj(h, "L1", 2026, "p9", WEEKS_5_TO_7, 20);
    insertProj(h, "L1", 2026, "p10", WEEKS_5_TO_18, 12);

    const data = ok(getWaivers(h, "L1", { rosterId: 1 }, SEED_NOW));
    expect(WaiverResponseSchema.safeParse(data).success).toBe(true);
    expect(data.priorityAdvisor.applicable).toBe(false);
    expect(data.priorityAdvisor.candidates).toEqual([]);
    expect(data.priorityAdvisor.reasons.some((r) => r.code === "FAAB_NOT_SUPPORTED")).toBe(true);
  });
});

describe("percentiles (WAIVER-3)", () => {
  it("returns [] for an empty input", () => {
    expect(percentiles([])).toEqual([]);
  });

  it("gives a single candidate percentile 100 (trivially the best of one)", () => {
    expect(percentiles([42])).toEqual([100]);
  });

  it("gives an all-equal set of more than one candidate percentile 50 for every entry, not 100", () => {
    expect(percentiles([5, 5, 5])).toEqual([50, 50, 50]);
  });

  it("ranks distinct values by fractional rank, ties averaging their span", () => {
    // [1, 1, 5, 10]: the two tied-lowest share percentile (0+1)/2/3*100 = 16.666...
    const result = percentiles([1, 1, 5, 10]);
    expect(result[0]).toBeCloseTo((50 / 3) * 1, 6);
    expect(result[1]).toBeCloseTo((50 / 3) * 1, 6);
    expect(result[2]).toBeCloseTo((2 / 3) * 100, 6);
    expect(result[3]).toBe(100);
  });
});

describe("substituteNulls (WAIVER-3)", () => {
  it("substitutes the mean of known values for null entries", () => {
    expect(substituteNulls([10, null, 20])).toEqual([10, 15, 20]);
  });

  it("M3 fix: when every value is null, substitutes 0 for all, giving percentile 50 for n>1 (not 100)", () => {
    const substituted = substituteNulls([null, null, null]);
    expect(substituted).toEqual([0, 0, 0]);
    expect(percentiles(substituted)).toEqual([50, 50, 50]);
  });

  it("the single-candidate all-null edge case gives percentile 100, per percentiles' n===1 rule", () => {
    const substituted = substituteNulls([null]);
    expect(substituted).toEqual([0]);
    expect(percentiles(substituted)).toEqual([100]);
  });
});
