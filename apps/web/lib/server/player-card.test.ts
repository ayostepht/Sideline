import { recordPlayerNewsFetch, schema, type DbHandle } from "@sideline/db";
import { playerHeadshotUrl, SyncStatusResponseSchema, SYNC_JOB_NAMES } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { handlePlayerNewsRefresh } from "./api-handlers";
import { getPlayerDetail, NEWS_REFRESH_MAX_PENDING, sanitizeNewsUrl } from "./players";
import { getSyncStatus } from "./sync";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";
import { getMatchup } from "./matchup";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function setup(): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, { schedule: true });
  return h;
}

function detail(h: DbHandle, id: string) {
  const r = getPlayerDetail(h, "L1", id, SEED_NOW);
  if (!r.ok) throw new Error("not ok");
  return r.data;
}

function addPts(h: DbHandle, playerId: string, week: number, a: number | null, p: number | null) {
  h.db
    .insert(schema.leaguePlayerWeekPoints)
    .values({ leagueId: "L1", season: 2026, week, playerId, actualPts: a, projPts: p })
    .run();
}

describe("playerHeadshotUrl", () => {
  it("player thumb, DEF logo, DEF without team", () => {
    expect(playerHeadshotUrl({ playerId: "4046", position: "QB", nflTeam: "KC" })).toBe(
      "https://sleepercdn.com/content/nfl/players/thumb/4046.jpg",
    );
    expect(playerHeadshotUrl({ playerId: "KC", position: "DEF", nflTeam: "KC" })).toBe(
      "https://sleepercdn.com/images/team_logos/nfl/kc.png",
    );
    expect(playerHeadshotUrl({ playerId: "KC", position: "DEF", nflTeam: null })).toBeNull();
  });
});

describe("player detail weekly rows", () => {
  it("builds newest-first rows with bye, DNP, projection, and excludes a current week without stats", () => {
    const h = setup();
    // p1: team T02 ((1 % 32)+1). Seed state week = 5, bye for T02 is week 5 + floor(1/2)%9 = 5.
    // Weeks 1..4 are completed; week 5 is current.
    addPts(h, "p1", 1, 12.5, 10);
    addPts(h, "p1", 2, null, 9);
    addPts(h, "p1", 4, 20, null);
    const d = detail(h, "p1");
    expect(d.weekly?.map((w) => w.week)).toEqual([4, 3, 2, 1]);
    const w1 = d.weekly?.find((w) => w.week === 1);
    expect(w1).toMatchObject({ actualPts: 12.5, projectedPts: 10, inProgress: false });
    expect(w1?.opponent).not.toBeNull();
    expect(w1?.isHome).not.toBeNull();
    const w2 = d.weekly?.find((w) => w.week === 2);
    expect(w2).toMatchObject({ actualPts: null, projectedPts: 9, positionRank: null });
    expect(d.weekly?.find((w) => w.week === 3)).toMatchObject({ actualPts: null });
    expect(d.weekly?.find((w) => w.week === 4)?.positionRank).toBe(1);
  });

  it("flags a bye week and includes an in-progress current week with stats", () => {
    const h = setup();
    // T02's bye in the seed schedule is week 5 (the current week): add stats elsewhere to check bye.
    const byeWeek = h.sqlite
      .prepare(
        `SELECT w FROM (SELECT DISTINCT week AS w FROM schedule WHERE week <= 4)
         WHERE w NOT IN (SELECT week FROM schedule WHERE home = 'T02' OR away = 'T02') LIMIT 1`,
      )
      .get() as { w: number } | undefined;
    // Seed gives T02 its bye in week 5, so no completed bye exists; move state forward.
    h.sqlite.prepare("UPDATE nfl_state SET week = 7").run();
    addPts(h, "p1", 7, 3, 8);
    const d = detail(h, "p1");
    expect(byeWeek).toBeUndefined();
    expect(d.weekly?.[0]).toMatchObject({ week: 7, inProgress: true, actualPts: 3 });
    const bye = d.weekly?.find((w) => w.week === 5);
    expect(bye).toMatchObject({ isBye: true, opponent: null, isHome: null, actualPts: null });
    expect(d.weekly?.filter((w) => w.isBye)).toHaveLength(1);
  });

  it("includes headshotUrl", () => {
    const h = setup();
    expect(detail(h, "p1").headshotUrl).toBe(
      "https://sleepercdn.com/content/nfl/players/thumb/p1.jpg",
    );
  });
});

describe("player news", () => {
  it("maps items newest first, limits to 5, sanitizes urls, reports lastFetchedAt", () => {
    const h = setup();
    expect(detail(h, "p1").news).toEqual({ items: [], lastFetchedAt: null });
    for (let i = 0; i < 7; i += 1) {
      h.db
        .insert(schema.playerNews)
        .values({
          id: `n${i}`,
          playerId: "p1",
          headline: `H${i}`,
          summary: null,
          url: i === 6 ? "javascript:alert(1)" : "https://example.com/a",
          source: "ESPN",
          kind: i === 6 ? "note" : "article",
          publishedAt: `2026-10-0${i + 1}T00:00:00.000Z`,
          fetchedAt: `2026-10-02T0${i}:00:00.000Z`,
        })
        .run();
    }
    const n = detail(h, "p1").news;
    expect(n?.items).toHaveLength(5);
    expect(n?.items[0]).toMatchObject({ id: "n6", url: null, kind: "note" });
    expect(n?.items[1]?.kind).toBe("article");
    expect(n?.items[1]?.url).toBe("https://example.com/a");
    expect(n?.lastFetchedAt).toBe("2026-10-02T06:00:00.000Z");
  });

  it("sanitizeNewsUrl", () => {
    expect(sanitizeNewsUrl(null)).toBeNull();
    expect(sanitizeNewsUrl("not a url")).toBeNull();
    expect(sanitizeNewsUrl("data:text/html,x")).toBeNull();
    expect(sanitizeNewsUrl("http://a.com/x")).toBe("http://a.com/x");
  });
});

describe("POST news refresh handler", () => {
  it("202 queued true, then false when deduped; false when fresh; 404; 400", () => {
    const h = setup();
    expect(handlePlayerNewsRefresh("L1", "p1", SEED_NOW)).toEqual({
      status: 202,
      body: { queued: true },
    });
    expect(handlePlayerNewsRefresh("L1", "p1", SEED_NOW).body).toEqual({ queued: false });
    h.db
      .insert(schema.playerNews)
      .values({
        id: "n",
        playerId: "p2",
        headline: "h",
        source: "ESPN",
        publishedAt: SEED_NOW.toISOString(),
        fetchedAt: new Date(SEED_NOW.getTime() - 10 * 60_000).toISOString(),
      })
      .run();
    expect(handlePlayerNewsRefresh("L1", "p2", SEED_NOW).body).toEqual({ queued: false });
    h.sqlite.prepare("UPDATE player_news SET fetched_at = ?").run("2026-10-02T09:00:00.000Z");
    expect(handlePlayerNewsRefresh("L1", "p2", SEED_NOW).body).toEqual({ queued: true });
    expect(handlePlayerNewsRefresh("L1", "nope", SEED_NOW).status).toBe(404);
    expect(handlePlayerNewsRefresh("nope", "p1", SEED_NOW).status).toBe(404);
    expect(handlePlayerNewsRefresh("L1", "bad id!", SEED_NOW).status).toBe(400);
  });

  it("an ok empty fetch throttles and sets lastFetchedAt; a failed attempt does not", () => {
    const h = setup();
    const at = new Date(SEED_NOW.getTime() - 10 * 60_000).toISOString();
    recordPlayerNewsFetch(h, { playerId: "p1", attemptedAt: at, ok: true, itemCount: 0 });
    expect(handlePlayerNewsRefresh("L1", "p1", SEED_NOW).body).toEqual({ queued: false });
    expect(detail(h, "p1").news).toEqual({ items: [], lastFetchedAt: at });
    recordPlayerNewsFetch(h, { playerId: "p2", attemptedAt: at, ok: false, itemCount: 0 });
    expect(handlePlayerNewsRefresh("L1", "p2", SEED_NOW).body).toEqual({ queued: true });
  });

  it("caps pending targeted requests", () => {
    setup();
    for (let i = 1; i <= NEWS_REFRESH_MAX_PENDING; i += 1) {
      expect(handlePlayerNewsRefresh("L1", `p${i}`, SEED_NOW).body).toEqual({ queued: true });
    }
    expect(handlePlayerNewsRefresh("L1", "p30", SEED_NOW)).toEqual({
      status: 202,
      body: { queued: false },
    });
  });
});

describe("sync status and swing rows", () => {
  it("lists the player_news job", () => {
    setup();
    const body = SyncStatusResponseSchema.parse(getSyncStatus(SEED_NOW).body);
    expect(SYNC_JOB_NAMES).toContain("player_news");
    expect(body.jobs.map((j) => j.job)).toContain("player_news");
  });

  it("swing players carry nflTeam and position", () => {
    const h = setup();
    for (const [rosterId, matchupId] of [
      [1, 1],
      [2, 1],
    ] as const) {
      h.db
        .insert(schema.matchups)
        .values({
          leagueId: "L1",
          week: 5,
          rosterId,
          matchupId,
          startersJson: "[]",
          playersJson: "[]",
          playersPointsJson: "{}",
          points: 0,
        })
        .run();
    }
    const r = getMatchup(h, "L1", { rosterId: 1, week: 5 }, SEED_NOW);
    if (!r.ok) throw new Error("matchup");
    expect(r.data.swingPlayers.length).toBeGreaterThan(0);
    for (const s of r.data.swingPlayers) {
      expect(s.nflTeam).toMatch(/^T\d\d$/);
      expect(s.position).not.toBeNull();
    }
  });
});
