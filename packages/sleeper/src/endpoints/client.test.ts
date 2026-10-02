import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  LeagueSchema,
  LeagueUserSchema,
  MatchupSchema,
  NflStateSchema,
  PlayerSchema,
  PlayerWeekProjectionSchema,
  PlayerWeekStatsSchema,
  RosterSchema,
  TransactionSchema,
  TrendingEntrySchema,
} from "@sideline/shared";
import {
  createSleeperServer,
  recordedFixtureRoot,
  syntheticFixtureRoot,
} from "../../../../tests/msw/server";
import { createSleeperHttp } from "../http/client.js";
import { SleeperHttpError, SleeperSchemaError } from "../http/errors.js";
import { InMemoryEtagStore } from "../http/etag-store.js";
import { createCallCounter, RateLimiter } from "../http/rate-limiter.js";
import {
  mapLeague,
  mapLeagueUser,
  mapMatchup,
  mapPlayer,
  mapProjection,
  mapRoster,
  mapState,
  mapStats,
  mapTransaction,
  mapTrending,
} from "../mappers/index.js";
import { createDefaultSleeperClient, createSleeperClient, sleeperUserAgent } from "./client.js";
import { type SleeperClient } from "./client.js";
import { type SleeperHttpOptions } from "../http/client.js";

const recorded = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
beforeAll(() => recorded.listen());
afterEach(() => {
  recorded.resetHandlers();
  recorded.mock.reset();
});
afterAll(() => recorded.close());

const L = "1000000000000000001";
const ctxWeek = { season: 2026, week: 1, seasonType: "regular" } as const;
const FETCHED = "2026-10-02T12:00:00.000Z";

function makeClient(extra: Partial<SleeperHttpOptions> = {}, warn?: (m: string) => void) {
  const limiter = new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100_000 });
  const httpCore = createSleeperHttp({ limiter, userAgent: "Sideline/test", ...extra });
  return createSleeperClient({ http: httpCore, ...(warn ? { onWarning: warn } : {}) });
}

/** Runs every method against one fixture root and parses mapped output with shared schemas. */
async function sweep(client: SleeperClient, league: string, weeks: number[]) {
  const state = await client.getState();
  expect(NflStateSchema.parse(mapState(state.data))).toBeTruthy();

  const lg = await client.getLeague(league);
  expect(LeagueSchema.parse(mapLeague(lg.data)).leagueId).toBe(league);

  const users = await client.getLeagueUsers(league);
  for (const u of users.data) LeagueUserSchema.parse(mapLeagueUser(u, league));

  const rosters = await client.getRosters(league);
  expect(rosters.data.length).toBeGreaterThan(0);
  for (const r of rosters.data) RosterSchema.parse(mapRoster(r, league));

  for (const week of weeks) {
    const m = await client.getMatchups(league, week);
    for (const row of m.data) MatchupSchema.parse(mapMatchup(row, league, week));
  }
}

describe("T1.2b: recorded fixtures pass endpoint schemas and mappers", () => {
  it("state, league, users, rosters, matchups weeks 1 to 14", async () => {
    await sweep(
      makeClient(),
      L,
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
  });

  it("maps the recorded roster decimals and null reserve/taxi", async () => {
    const { data } = await makeClient().getRosters(L);
    const first = mapRoster(data[0] as (typeof data)[number], L);
    expect(first.fpts).toBe(366.28);
    expect(first.fptsAgainst).toBe(399.46);
    expect(first.reserve).toEqual([]);
    expect(first.taxi).toEqual([]);
    expect(first.waiverPosition).toBe(10);
  });

  it("maps the recorded league (rolling waivers) and the user leagues list", async () => {
    const client = makeClient();
    const league = mapLeague((await client.getLeague(L)).data);
    expect(league.waiverMode).toBe("rolling");
    expect(league.waiverDayOfWeek).toBe(2);
    expect(league.previousLeagueId).toBeNull();
    const user = await client.getUser("manager_04");
    expect(user.data?.user_id).toBe("100000000000000004");
    const leagues = await client.getUserLeagues("100000000000000004", 2026);
    expect(leagues.data).toHaveLength(2);
    for (const l of leagues.data) LeagueSchema.parse(mapLeague(l));
  });

  it("users map team name from metadata and fall back to null", async () => {
    const { data } = await makeClient().getLeagueUsers(L);
    const mapped = data.map((u) => mapLeagueUser(u, L));
    expect(mapped.some((u) => u.teamName === null)).toBe(true);
    expect(mapped.some((u) => u.teamName !== null)).toBe(true);
  });

  it("transactions weeks 1 to 4 keep failed claims", async () => {
    const client = makeClient();
    const all = [];
    for (const week of [1, 2, 3, 4]) {
      const { data } = await client.getTransactions(L, week);
      for (const t of data) all.push(TransactionSchema.parse(mapTransaction(t, L)));
    }
    expect(all.filter((t) => t.type === "waiver" && t.status === "failed")).toHaveLength(10);
    expect(all.filter((t) => t.type === "waiver" && t.status === "complete")).toHaveLength(14);
    expect(all.filter((t) => t.type === "free_agent")).toHaveLength(46);
    expect(all.every((t) => t.waiverBid === null)).toBe(true);
  });

  it("brackets, drafts, picks and traded picks validate", async () => {
    const client = makeClient();
    expect((await client.getTradedPicks(L)).data).toEqual([]);
    expect((await client.getWinnersBracket(L)).data).toHaveLength(7);
    expect((await client.getLosersBracket(L)).data).toHaveLength(4);
    const drafts = await client.getDrafts(L);
    expect(drafts.data).toHaveLength(1);
    const picks = await client.getDraftPicks("1000000000000001001");
    expect(picks.data).toHaveLength(150);
  });

  it("players: all entries validate, map to the shared schema, gsis trimmed", async () => {
    const { data } = await makeClient().getPlayers();
    expect(data.skipped).toBe(0);
    expect(data.players).toHaveLength(1021);
    for (const p of data.players) PlayerSchema.parse(mapPlayer(p));
    const def = data.players.find((p) => p.position === "DEF");
    expect(def && mapPlayer(def).fullName.length).toBeGreaterThan(0);
  });

  it("trending add and drop", async () => {
    const client = makeClient();
    for (const type of ["add", "drop"] as const) {
      const { data } = await client.getTrending(type);
      expect(data).toHaveLength(50);
      for (const e of mapTrending(data, { type, lookbackHours: 24, fetchedAt: FETCHED })) {
        TrendingEntrySchema.parse(e);
      }
    }
    expect(recorded.mock.requests).toEqual([
      "/v1/players/nfl/trending/add",
      "/v1/players/nfl/trending/drop",
    ]);
  });

  it("projections weeks 1 to 5 and stats weeks 1 to 3 map to shared schemas", async () => {
    const client = makeClient();
    for (const week of [1, 2, 3, 4, 5]) {
      const res = await client.getProjections(2026, week, "regular");
      expect(res.status).toBe("ok");
      if (res.status !== "ok") continue;
      for (const row of res.rows) {
        PlayerWeekProjectionSchema.parse(
          mapProjection(row, { ...ctxWeek, week, fetchedAt: FETCHED }),
        );
      }
    }
    for (const week of [1, 2, 3]) {
      const res = await client.getStats(2026, week, "regular");
      expect(res.status).toBe("ok");
      if (res.status !== "ok") continue;
      for (const row of res.rows) PlayerWeekStatsSchema.parse(mapStats(row, { ...ctxWeek, week }));
    }
  });
});

describe("T1.2b: synthetic fixtures pass endpoint schemas and mappers", () => {
  const synthetic = createSleeperServer({ fixtureRoot: syntheticFixtureRoot });
  const SL = "100000000000000001";

  beforeAll(() => {
    recorded.close();
    synthetic.listen();
  });
  afterEach(() => synthetic.resetHandlers());
  afterAll(() => {
    synthetic.close();
    recorded.listen();
  });

  it("state, league, users, rosters, matchups", async () => {
    await sweep(makeClient(), SL, [1]);
  });

  it("transactions (empty), players and trending", async () => {
    const client = makeClient();
    expect((await client.getTransactions(SL, 1)).data).toEqual([]);
    const players = await client.getPlayers();
    expect(players.data.skipped).toBe(0);
    for (const p of players.data.players) PlayerSchema.parse(mapPlayer(p));
    const t = await client.getTrending("add");
    expect(
      mapTrending(t.data, { type: "add", lookbackHours: 24, fetchedAt: FETCHED }),
    ).toHaveLength(1);
  });

  it("projections and stats rows have no opponent, gp or player block: all dropped, unavailable", async () => {
    const client = makeClient();
    for (const res of [
      await client.getProjections(2026, 1, "regular"),
      await client.getStats(2026, 1, "regular"),
    ]) {
      expect(res.status).toBe("unavailable");
      expect(res.dropped.position).toBe(2);
    }
  });
});

describe("ADR-005: week 5 projections are non-empty after filtering", () => {
  it("returns ok with real rows and counted drops", async () => {
    const res = await makeClient().getProjections(2026, 5, "regular");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.rows.length).toBe(464);
    expect(res.dropped).toEqual({ placeholder: 285, position: 76, other: 0 });
    expect(res.rows.every((r) => r.opponent != null && r.stats["gp"] !== undefined)).toBe(true);
  });

  it("stats week 4 (no games yet, empty array) is unavailable", async () => {
    const res = await makeClient().getStats(2026, 4, "regular");
    expect(res).toMatchObject({ status: "unavailable", reason: "empty" });
  });

  it("always sends season_type and the six position params", async () => {
    let url = "";
    recorded.use(
      http.get("https://api.sleeper.app/projections/nfl/2026/5", ({ request }) => {
        url = request.url;
        return HttpResponse.json([]);
      }),
    );
    await makeClient().getProjections(2026, 5, "regular");
    const q = new URL(url).searchParams;
    expect(q.get("season_type")).toBe("regular");
    expect(q.getAll("position[]")).toEqual(["QB", "RB", "WR", "TE", "K", "DEF"]);
  });
});

describe("ADR-002: etag usage", () => {
  function etagHandler(path: string, seen: Array<string | null>, body: Record<string, unknown>) {
    return http.get(`https://api.sleeper.app${path}`, ({ request }) => {
      const inm = request.headers.get("if-none-match");
      seen.push(inm);
      if (inm === '"v1"') return new HttpResponse(null, { status: 304 });
      return HttpResponse.json(body, { headers: { etag: '"v1"' } });
    });
  }

  it("getPlayers never sends If-None-Match even with a store configured", async () => {
    const seen: Array<string | null> = [];
    recorded.use(etagHandler("/v1/players/nfl", seen, { "1": { player_id: "1" } }));
    const store = new InMemoryEtagStore();
    const client = makeClient({ etagStore: store });
    await client.getPlayers();
    await client.getPlayers();
    expect(seen).toEqual([null, null]);
    expect(await store.get("https://api.sleeper.app/v1/players/nfl")).toBeUndefined();
  });

  it("other endpoints send If-None-Match and reuse the cached body on 304", async () => {
    const seen: Array<string | null> = [];
    const state = { season: "2026", week: 4, season_type: "regular" };
    recorded.use(etagHandler("/v1/state/nfl", seen, state));
    const client = makeClient({ etagStore: new InMemoryEtagStore() });
    const first = await client.getState();
    const second = await client.getState();
    expect(seen).toEqual([null, '"v1"']);
    expect(first.notModified).toBe(false);
    expect(second.notModified).toBe(true);
    expect(second.data.week).toBe(4);
  });

  it("without a store no If-None-Match is sent", async () => {
    const seen: Array<string | null> = [];
    recorded.use(
      etagHandler("/v1/state/nfl", seen, { season: "2026", week: 4, season_type: "regular" }),
    );
    const client = makeClient();
    await client.getState();
    await client.getState();
    expect(seen).toEqual([null, null]);
  });
});

describe("ADR-002: validation at the boundary", () => {
  it("a schema-invalid response raises SleeperSchemaError with the path", async () => {
    recorded.use(
      http.get("https://api.sleeper.app/v1/state/nfl", () =>
        HttpResponse.json({ season: "2026", week: "four", season_type: "regular" }),
      ),
    );
    const err = await makeClient()
      .getState()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperSchemaError);
    expect((err as SleeperSchemaError).issues[0]?.path).toBe("week");
  });

  it("a non-array projections payload raises SleeperSchemaError", async () => {
    recorded.use(
      http.get("https://api.sleeper.app/projections/nfl/2026/9", () =>
        HttpResponse.json({ error: "changed" }),
      ),
    );
    await expect(makeClient().getProjections(2026, 9, "regular")).rejects.toBeInstanceOf(
      SleeperSchemaError,
    );
  });

  it("an invalid single player entry is skipped, counted and warned about", async () => {
    recorded.use(
      http.get("https://api.sleeper.app/v1/players/nfl", () =>
        HttpResponse.json({
          "1": { player_id: "1", full_name: "A B", gsis_id: " 00-1 " },
          "2": { player_id: "2", age: "old" },
          "3": null,
        }),
      ),
    );
    const warnings: string[] = [];
    const { data } = await makeClient({}, (m) => warnings.push(m)).getPlayers();
    expect(data.players.map((p) => p.player_id)).toEqual(["1"]);
    expect(data.skipped).toBe(2);
    expect(warnings).toEqual(["players: skipped invalid entries"]);
  });

  it("a row that fails row validation is dropped as other, not fatal", async () => {
    recorded.use(
      http.get("https://api.sleeper.app/stats/nfl/2026/9", () =>
        HttpResponse.json([
          { player_id: 5, stats: {} },
          { player_id: "6", opponent: "KC", stats: { gms_active: 1 }, player: { position: "WR" } },
        ]),
      ),
    );
    const res = await makeClient().getStats(2026, 9, "regular");
    expect(res.status).toBe("ok");
    expect(res.dropped.other).toBe(1);
  });

  it("an unknown user is data null; a 404 league surfaces as SleeperHttpError", async () => {
    recorded.use(http.get("https://api.sleeper.app/v1/user/nobody", () => HttpResponse.json(null)));
    expect((await makeClient().getUser("nobody")).data).toBeNull();
    await expect(makeClient().getLeague("999")).rejects.toBeInstanceOf(SleeperHttpError);
  });

  it("getUser strips personal fields", async () => {
    recorded.use(
      http.get("https://api.sleeper.app/v1/user/x", () =>
        HttpResponse.json({ user_id: "1", display_name: "d", email: "e@x.com", token: "t" }),
      ),
    );
    const { data } = await makeClient().getUser("x");
    expect(data).toEqual({ user_id: "1", display_name: "d" });
  });
});

describe("ADR-002: client plumbing", () => {
  it("passes the per-call counter through to the limiter", async () => {
    const counter = createCallCounter();
    const client = makeClient();
    await client.getState({ counter });
    await client.getLeague(L, { counter });
    expect(counter.calls).toBe(2);
  });

  it("default client sends Sideline/<version> (self-hosted) as the User-Agent", async () => {
    let ua: string | null = null;
    recorded.use(
      http.get("https://api.sleeper.app/v1/state/nfl", ({ request }) => {
        ua = request.headers.get("user-agent");
        return HttpResponse.json({ season: "2026", week: 1, season_type: "regular" });
      }),
    );
    const limiter = new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100_000 });
    await createDefaultSleeperClient({ limiter, version: "1.2.3" }).getState();
    expect(ua).toBe("Sideline/1.2.3 (self-hosted)");
    expect(sleeperUserAgent("9")).toBe("Sideline/9 (self-hosted)");
  });
});
