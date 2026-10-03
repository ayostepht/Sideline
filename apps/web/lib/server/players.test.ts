import { schema, type DbHandle } from "@sideline/db";
import {
  PlayerDetailResponseSchema,
  PlayersListResponseSchema,
  type PlayerDetailResponse,
  type PlayersListRequest,
  type PlayersListResponse,
} from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { handlePlayerDetail, handlePlayersList } from "./api-handlers";
import { getPlayerDetail, getPlayersList, type Lookup } from "./players";
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

function okList(r: Lookup<PlayersListResponse>): PlayersListResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}
function okDetail(r: Lookup<PlayerDetailResponse>): PlayerDetailResponse {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

function insertPoints(
  h: DbHandle,
  rows: { playerId: string; week: number; actualPts: number }[],
): void {
  for (const r of rows) {
    h.db
      .insert(schema.leaguePlayerWeekPoints)
      .values({ leagueId: "L1", season: 2026, ...r })
      .run();
  }
}

function insertUsage(
  h: DbHandle,
  rows: { playerId: string; week: number; snapPct: number }[],
): void {
  for (const r of rows) {
    h.db
      .insert(schema.usageWeek)
      .values({ season: 2026, week: r.week, playerId: r.playerId, snapPct: r.snapPct })
      .run();
  }
}

function insertTrending(
  h: DbHandle,
  rows: { playerId: string; type: "add" | "drop"; count: number }[],
): void {
  for (const r of rows) {
    h.db
      .insert(schema.trending)
      .values({
        playerId: r.playerId,
        type: r.type,
        count: r.count,
        lookbackHours: 24,
        fetchedAt: SEED_NOW.toISOString(),
      })
      .run();
  }
}

const basePage = (overrides: Partial<PlayersListRequest> = {}): PlayersListRequest => ({
  page: 1,
  pageSize: 10,
  ...overrides,
});

describe("getPlayersList", () => {
  it("not_found for an unknown league", () => {
    const h = setup();
    expect(getPlayersList(h, "nope", basePage(), SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("paginates with no overlap between pages, and an empty page past the end", () => {
    const h = setup({ playerCount: 30, rosterCount: 1, rosterSize: 30 });
    const page1 = okList(getPlayersList(h, "L1", basePage({ pageSize: 10 }), SEED_NOW));
    const page2 = okList(getPlayersList(h, "L1", basePage({ page: 2, pageSize: 10 }), SEED_NOW));
    expect(page1.total).toBe(30);
    expect(page1.players).toHaveLength(10);
    expect(page2.players).toHaveLength(10);
    const ids1 = new Set(page1.players.map((p) => p.playerId));
    for (const p of page2.players) expect(ids1.has(p.playerId)).toBe(false);
    expect(page1.hasMore).toBe(true);

    const past = okList(getPlayersList(h, "L1", basePage({ page: 10, pageSize: 10 }), SEED_NOW));
    expect(past.players).toEqual([]);
    expect(past.total).toBe(30);
    expect(past.hasMore).toBe(false);
  });

  it("filters by position", () => {
    const h = setup({ playerCount: 30, rosterCount: 1, rosterSize: 30 });
    const r = okList(getPlayersList(h, "L1", basePage({ pageSize: 50, position: "RB" }), SEED_NOW));
    expect(r.players.length).toBeGreaterThan(0);
    expect(r.players.length).toBeLessThan(30);
    for (const p of r.players) expect(p.position).toBe("RB");
  });

  it("filters by name substring, case-insensitively", () => {
    const h = setup({ playerCount: 30, rosterCount: 1, rosterSize: 30 });
    const r = okList(getPlayersList(h, "L1", basePage({ pageSize: 50, q: "number7" }), SEED_NOW));
    expect(r.players).toHaveLength(1);
    expect(r.players[0]?.name).toBe("Player Number7");
  });

  it("computes a scoring trend and signal for players with history, on the returned page only", () => {
    const h = setup({ playerCount: 5, rosterCount: 1, rosterSize: 5 });
    insertPoints(h, [
      { playerId: "p1", week: 1, actualPts: 5 },
      { playerId: "p1", week: 2, actualPts: 5 },
      { playerId: "p1", week: 3, actualPts: 25 },
      { playerId: "p1", week: 4, actualPts: 25 },
      { playerId: "p1", week: 5, actualPts: 25 },
    ]);
    const r = okList(getPlayersList(h, "L1", basePage({ pageSize: 50 }), SEED_NOW));
    expect(PlayersListResponseSchema.safeParse(r).success).toBe(true);
    const p1 = r.players.find((p) => p.playerId === "p1");
    expect(p1?.gamesPlayed).toBe(5);
    expect(p1?.seasonPpg).toBeCloseTo(17, 5);
    expect(p1?.signal).toBe("Rising");
    const untouched = r.players.find((p) => p.playerId === "p2");
    expect(untouched?.gamesPlayed).toBe(0);
    expect(untouched?.signal).toBeNull();
  });
});

describe("getPlayerDetail", () => {
  it("not_found for an unknown league", () => {
    const h = setup();
    expect(getPlayerDetail(h, "nope", "p1", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("not_found for an unknown player id", () => {
    const h = setup();
    expect(getPlayerDetail(h, "L1", "does-not-exist", SEED_NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("full season history: scoring, usage, consistency, signal, and momentum all populate", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    // p1 is position RB (n % 4 === 1 in test-seed's POSITIONS cycle).
    insertPoints(h, [
      { playerId: "p1", week: 1, actualPts: 10 },
      { playerId: "p1", week: 2, actualPts: 10 },
      { playerId: "p1", week: 3, actualPts: 20 },
      { playerId: "p1", week: 4, actualPts: 20 },
      { playerId: "p1", week: 5, actualPts: 20 },
    ]);
    insertUsage(h, [
      { playerId: "p1", week: 1, snapPct: 0.5 },
      { playerId: "p1", week: 2, snapPct: 0.5 },
      { playerId: "p1", week: 3, snapPct: 0.9 },
      { playerId: "p1", week: 4, snapPct: 0.9 },
      { playerId: "p1", week: 5, snapPct: 0.9 },
    ]);
    insertTrending(h, [{ playerId: "p1", type: "add", count: 500 }]);

    const data = okDetail(getPlayerDetail(h, "L1", "p1", SEED_NOW));
    expect(PlayerDetailResponseSchema.safeParse(data).success).toBe(true);
    expect(data.position).toBe("RB");
    expect(data.scoring.gamesPlayed).toBe(5);
    expect(data.scoring.weeklySeries).toHaveLength(5);
    expect(data.usage.fields.find((f) => f.field === "snapPct")?.delta).toBeGreaterThan(0);
    expect(data.consistency.weeks).toHaveLength(5);
    expect(data.consistency.startableCount).toBeGreaterThan(0);
    // Only RB with points each week in this fixture: rank 1 every week -> boom (<= startableCount).
    expect(data.consistency.boomCount).toBe(5);
    expect(data.signal).toBe("Rising");
    expect(data.momentum.addCount).toBe(500);
    expect(data.momentum.label).toBe("Warm");
  });

  it("sparse/no history: degrades gracefully instead of crashing", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    const data = okDetail(getPlayerDetail(h, "L1", "p2", SEED_NOW));
    expect(PlayerDetailResponseSchema.safeParse(data).success).toBe(true);
    expect(data.scoring.gamesPlayed).toBe(0);
    expect(data.scoring.seasonPpg).toBeNull();
    expect(data.scoring.reasons).toEqual([
      expect.objectContaining({ code: "TREND_NO_GAMES_PLAYED" }),
    ]);
    expect(data.consistency.weeks).toEqual([]);
    expect(data.signal).toBeNull();
    expect(data.momentum.addCount).toBe(0);
    expect(data.momentum.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "TREND_MOMENTUM_NO_DATA" })]),
    );
  });

  it("a player with no known position degrades consistency and usage without crashing", () => {
    const h = setup({ rosterCount: 1, rosterSize: 8, playerCount: 8 });
    h.sqlite.prepare("UPDATE players SET position = NULL WHERE player_id = ?").run("p3");
    insertPoints(h, [{ playerId: "p3", week: 1, actualPts: 7 }]);
    const data = okDetail(getPlayerDetail(h, "L1", "p3", SEED_NOW));
    expect(PlayerDetailResponseSchema.safeParse(data).success).toBe(true);
    expect(data.position).toBeNull();
    expect(data.consistency.startableCount).toBe(0);
    expect(data.consistency.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "TREND_INVALID_STARTABLE_COUNT" })]),
    );
    expect(data.usage.fields).toEqual([]);
  });
});

describe("handlePlayersList and handlePlayerDetail", () => {
  it("200 with a valid league, 404 for an unknown one, 400 for a bad query", () => {
    const h = setup({ playerCount: 5, rosterCount: 1, rosterSize: 5 });
    const ok = handlePlayersList("L1", new URLSearchParams("page=1&pageSize=5"), SEED_NOW);
    expect(ok.status).toBe(200);
    expect(PlayersListResponseSchema.safeParse(ok.body).success).toBe(true);
    expect(handlePlayersList("nope", new URLSearchParams(), SEED_NOW).status).toBe(404);
    expect(handlePlayersList("L1", new URLSearchParams("pageSize=0"), SEED_NOW).status).toBe(400);
    void h;
  });

  it("200 for a known player, 404 for an unknown player or league", () => {
    const h = setup({ playerCount: 5, rosterCount: 1, rosterSize: 5 });
    const ok = handlePlayerDetail("L1", "p1", SEED_NOW);
    expect(ok.status).toBe(200);
    expect(PlayerDetailResponseSchema.safeParse(ok.body).success).toBe(true);
    expect(handlePlayerDetail("L1", "nope", SEED_NOW).status).toBe(404);
    expect(handlePlayerDetail("nope", "p1", SEED_NOW).status).toBe(404);
    void h;
  });
});
