import { schema, type DbHandle } from "@sideline/db";
import { WaiverResponseSchema, type WaiverResponse } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { getWaivers, type Lookup } from "./waivers";
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
  });
});
