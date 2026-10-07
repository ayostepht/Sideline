import { evaluateTrade } from "@sideline/core";
import { schema, setSleeperUserId, type DbHandle } from "@sideline/db";
import {
  TRADE_FINDER_PLAYOFF_TOP_N,
  TradeEvaluateResponseSchema,
  TradeFinderResponseSchema,
} from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { GET as evaluateRoute } from "../../app/api/l/[leagueId]/trades/evaluate/route";
import { GET as finderRoute } from "../../app/api/l/[leagueId]/trades/finder/route";
import { getLeagueIntelligence } from "./league-intelligence";
import { getTradeTeams } from "./roster-strength";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";
import { evaluateTradeForLeague, findTradesForLeague } from "./trades";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function setup(opts: Parameters<typeof seedLeague>[1] = {}, withPlayoffs = true): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, opts);
  setSleeperUserId(h, "u1");
  if (withPlayoffs) {
    h.sqlite.prepare("UPDATE leagues SET playoff_teams = ? WHERE league_id = 'L1'").run(2);
  }
  return h;
}

/** Real future pairings: weeks 5..14, rosters (1,2) and (3,4) face each other. */
function insertSchedule(h: DbHandle, rosterCount: number): void {
  for (let w = 5; w <= 14; w += 1) {
    for (let r = 1; r + 1 <= rosterCount; r += 2) {
      for (const id of [r, r + 1]) {
        h.db
          .insert(schema.matchups)
          .values({
            leagueId: "L1",
            week: w,
            rosterId: id,
            matchupId: (r + 1) / 2,
            startersJson: "[]",
            startersPointsJson: "[]",
            playersJson: "[]",
            playersPointsJson: "{}",
            points: 0,
          })
          .run();
      }
    }
  }
}

function project(h: DbHandle, values: Record<string, number>): void {
  for (const [playerId, v] of Object.entries(values)) {
    for (let week = 5; week <= 18; week += 1) {
      h.db
        .insert(schema.leaguePlayerWeekPoints)
        .values({ leagueId: "L1", season: 2026, week, playerId, projPts: v })
        .run();
    }
  }
}

/**
 * Roster 1 = p1..p8 (RB,WR,TE,QB,RB,WR,TE,QB), roster 2 = p9..p16 (RB,WR,TE,QB,RB,WR,TE,QB).
 * Roster 1 is rich at QB and thin at RB; roster 2 is the reverse.
 */
function skew(h: DbHandle): void {
  project(h, {
    p4: 30,
    p8: 30,
    p1: 3,
    p5: 3,
    p9: 25,
    p13: 25,
    p12: 3,
    p16: 3,
  });
}

function fail(): never {
  throw new Error("roster missing");
}

function ok<T>(r: { ok: true; data: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

describe("getTradeTeams", () => {
  it("flags IR and taxi players as reserve and keeps the rest", () => {
    const h = setup();
    h.sqlite
      .prepare(
        "UPDATE rosters SET reserve_json = '[\"p1\"]', taxi_json = '[\"p2\"]' WHERE roster_id = 1",
      )
      .run();
    const data = ok(getTradeTeams(h, "L1", SEED_NOW));
    const r1 = data.teams.find((t) => t.rosterId === 1);
    expect(r1?.players.find((p) => p.playerId === "p1")?.reserve).toBe(true);
    expect(r1?.players.find((p) => p.playerId === "p2")?.reserve).toBe(true);
    expect(r1?.players.find((p) => p.playerId === "p3")?.reserve).toBe(false);
    expect(data.rosterPositions).toContain("FLEX");
    expect(getTradeTeams(h, "nope", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("is served from computed_cache on the second call", () => {
    const h = setup();
    const a = ok(getTradeTeams(h, "L1", SEED_NOW));
    const b = ok(getTradeTeams(h, "L1", SEED_NOW));
    expect(b).toEqual(a);
    const n = h.sqlite
      .prepare("SELECT COUNT(*) AS n FROM computed_cache WHERE kind = 'trade-teams'")
      .get() as { n: number };
    expect(n.n).toBe(1);
  });
});

describe("evaluateTradeForLeague", () => {
  it("matches core lineup deltas and playoff before equals league-intelligence", () => {
    const h = setup();
    insertSchedule(h, 4);
    skew(h);
    const req = { otherRosterId: 2, give: ["p4"], get: ["p9"] };
    const res = ok(evaluateTradeForLeague(h, "L1", req, SEED_NOW));
    expect(TradeEvaluateResponseSchema.safeParse(res).success).toBe(true);

    const teams = ok(getTradeTeams(h, "L1", SEED_NOW));
    const core = evaluateTrade({
      rosterPositions: teams.rosterPositions,
      mine: teams.teams.find((t) => t.rosterId === 1) ?? fail(),
      theirs: teams.teams.find((t) => t.rosterId === 2) ?? fail(),
      give: ["p4"],
      get: ["p9"],
    });
    if (!core.ok) throw new Error("core failed");
    expect(res.mine.rosLineupDelta).toBeCloseTo(core.mine.rosLineupDelta, 9);
    expect(res.theirs.rosLineupDelta).toBeCloseTo(core.theirs.rosLineupDelta, 9);
    expect(res.mine.rosLineupDelta).toBeGreaterThan(0);
    expect(res.theirs.rosLineupDelta).toBeGreaterThan(0);
    expect(res.fairness).toBe(core.fairness);
    expect(res.give[0]).toEqual({
      playerId: "p4",
      name: "Player Number4",
      position: "QB",
      nflTeam: "T05",
    });

    const li = ok(getLeagueIntelligence(h, "L1", SEED_NOW));
    const pct = (id: number) => li.teams.find((t) => t.rosterId === id)?.playoffOdds?.playoffPct;
    expect(res.mine.playoffPctBefore).toBe(pct(1));
    expect(res.theirs.playoffPctBefore).toBe(pct(2));
    expect(res.mine.playoffPctAfter).not.toBeNull();
    expect(res.mine.playoffPctDelta).toBeCloseTo(
      (res.mine.playoffPctAfter ?? 0) - (res.mine.playoffPctBefore ?? 0),
      12,
    );
    // Improving my lineup and theirs in a 4-team league: my own odds should not fall.
    expect(res.mine.playoffPctDelta ?? -1).toBeGreaterThanOrEqual(0);
  });

  it("returns null playoff fields with a reason when no games remain or playoffs unknown", () => {
    const h = setup();
    skew(h);
    const req = { otherRosterId: 2, give: ["p4"], get: ["p9"] };
    const noSchedule = ok(evaluateTradeForLeague(h, "L1", req, SEED_NOW));
    expect(noSchedule.mine.playoffPctBefore).toBeNull();
    expect(noSchedule.mine.playoffPctDelta).toBeNull();
    expect(noSchedule.mine.reasons.some((r) => r.code === "TRADE_PLAYOFF_UNAVAILABLE")).toBe(true);

    const h2 = setup({}, false);
    insertSchedule(h2, 4);
    skew(h2);
    const unknown = ok(evaluateTradeForLeague(h2, "L1", req, SEED_NOW));
    expect(unknown.theirs.playoffPctAfter).toBeNull();
  });

  it("reports auto-dropped players in an uneven trade", () => {
    const h = setup();
    skew(h);
    const res = ok(
      evaluateTradeForLeague(
        h,
        "L1",
        { otherRosterId: 2, give: ["p4"], get: ["p9", "p10"] },
        SEED_NOW,
      ),
    );
    expect(res.mine.dropped).toHaveLength(1);
    expect(res.theirs.dropped).toHaveLength(0);
  });

  it("rejects invalid proposals as typed 400-style errors, not throws", () => {
    const h = setup();
    const bad = (req: unknown) => evaluateTradeForLeague(h, "L1", req, SEED_NOW);
    expect(bad({ otherRosterId: 2, give: ["p99"], get: ["p9"] })).toMatchObject({
      ok: false,
      reason: "invalid",
      code: "invalid_trade",
    });
    expect(bad({ otherRosterId: 2, give: ["p4"], get: ["p1"] })).toMatchObject({
      reason: "invalid",
    });
    expect(bad({ otherRosterId: 1, give: ["p4"], get: ["p9"] })).toMatchObject({
      reason: "invalid",
      code: "invalid_trade",
    });
    expect(bad({ otherRosterId: 77, give: ["p4"], get: ["p9"] })).toMatchObject({
      reason: "invalid",
    });
    expect(bad({ otherRosterId: 2, give: [], get: ["p9"] })).toMatchObject({
      reason: "invalid",
      code: "invalid_request",
    });
    expect(bad("nonsense")).toMatchObject({ reason: "invalid" });
    expect(
      evaluateTradeForLeague(h, "nope", { otherRosterId: 2, give: ["p4"], get: ["p9"] }, SEED_NOW),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("is no_team when no Sleeper user matches a roster", () => {
    const h = setup();
    setSleeperUserId(h, "stranger");
    expect(
      evaluateTradeForLeague(h, "L1", { otherRosterId: 2, give: ["p4"], get: ["p9"] }, SEED_NOW),
    ).toEqual({ ok: false, reason: "no_team" });
    expect(findTradesForLeague(h, "L1", SEED_NOW)).toEqual({ ok: false, reason: "no_team" });
  });
});

describe("findTradesForLeague", () => {
  it("returns only both-improving trades, with playoff fields for at most the top 10", () => {
    const h = setup({ rosterCount: 4, rosterSize: 12, playerCount: 60 });
    insertSchedule(h, 4);
    // Roster 1 (p1..p12) is rich at QB and thin at RB/WR; roster 2 (p13..p24) is the reverse.
    project(h, {
      p4: 30,
      p8: 30,
      p12: 28,
      p1: 3,
      p5: 3,
      p9: 3,
      p2: 4,
      p6: 4,
      p10: 3,
      ...Object.fromEntries(Array.from({ length: 24 }, (_, k) => [`p${25 + k}`, 10])),
      p13: 25,
      p17: 25,
      p21: 24,
      p14: 22,
      p18: 22,
      p16: 3,
      p20: 3,
      p24: 3,
    });
    const res = ok(findTradesForLeague(h, "L1", SEED_NOW));
    expect(TradeFinderResponseSchema.safeParse(res).success).toBe(true);
    expect(res.evaluatedCount).toBeGreaterThan(0);
    expect(res.suggestions.length).toBeGreaterThan(0);
    for (const s of res.suggestions) {
      expect(s.mine.rosLineupDelta).toBeGreaterThan(0);
      expect(s.theirs.rosLineupDelta).toBeGreaterThan(0);
      expect(s.otherRosterId).not.toBe(1);
    }
    const withPlayoff = res.suggestions.filter((s) => s.mine.playoffPctBefore !== null);
    expect(withPlayoff.length).toBeLessThanOrEqual(TRADE_FINDER_PLAYOFF_TOP_N);
    expect(withPlayoff.length).toBe(Math.min(res.suggestions.length, TRADE_FINDER_PLAYOFF_TOP_N));
    res.suggestions.slice(TRADE_FINDER_PLAYOFF_TOP_N).forEach((s) => {
      expect(s.mine.playoffPctAfter).toBeNull();
      expect(s.theirs.playoffPctDelta).toBeNull();
    });
  });

  it("caches per roster and serves the cached result", () => {
    const h = setup();
    insertSchedule(h, 4);
    skew(h);
    const a = ok(findTradesForLeague(h, "L1", SEED_NOW));
    const b = ok(findTradesForLeague(h, "L1", SEED_NOW));
    expect(b.suggestions).toEqual(a.suggestions);
    const n = h.sqlite
      .prepare("SELECT COUNT(*) AS n FROM computed_cache WHERE kind = 'trade-finder:1'")
      .get() as { n: number };
    expect(n.n).toBe(1);
  });

  it("returns an empty list when nothing helps both sides, and 404-style for unknown league", () => {
    const h = setup();
    expect(ok(findTradesForLeague(h, "L1", SEED_NOW)).suggestions).toEqual([]);
    expect(findTradesForLeague(h, "nope", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("trade routes", () => {
  const evaluate = (query: string, leagueId = "L1") =>
    evaluateRoute(new Request(`http://localhost/api/l/${leagueId}/trades/evaluate${query}`), {
      params: Promise.resolve({ leagueId }),
    });
  const finder = (leagueId = "L1") =>
    finderRoute(new Request(`http://localhost/api/l/${leagueId}/trades/finder`), {
      params: Promise.resolve({ leagueId }),
    });

  it("evaluate: 200 with a valid body", async () => {
    const h = setup();
    insertSchedule(h, 4);
    skew(h);
    const r = await evaluate("?other=2&give=p4&get=p9");
    expect(r.status).toBe(200);
    expect(TradeEvaluateResponseSchema.safeParse(await r.json()).success).toBe(true);
  });

  it("evaluate: 400 for bad params, bad proposals; 404 unknown league", async () => {
    setup();
    expect((await evaluate("")).status).toBe(400);
    expect((await evaluate("?other=abc&give=p4&get=p9")).status).toBe(400);
    expect((await evaluate("?other=2&give=p4,p4&get=p9")).status).toBe(400);
    const own = await evaluate("?other=1&give=p4&get=p9");
    expect(own.status).toBe(400);
    expect(await own.json()).toMatchObject({ error: { code: "invalid_trade" } });
    expect((await evaluate("?other=2&give=p99&get=p9")).status).toBe(400);
    expect((await evaluate("?other=2&give=p4&get=p9", "nope")).status).toBe(404);
  });

  it("evaluate: 404 no_team without a matching user", async () => {
    const h = setup();
    setSleeperUserId(h, "stranger");
    const r = await evaluate("?other=2&give=p4&get=p9");
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: { code: "no_team" } });
  });

  it("finder: 200, 404 unknown league, 404 no_team", async () => {
    const h = setup();
    skew(h);
    const r = await finder();
    expect(r.status).toBe(200);
    expect(TradeFinderResponseSchema.safeParse(await r.json()).success).toBe(true);
    expect((await finder("nope")).status).toBe(404);
    setSleeperUserId(h, "stranger");
    expect(await (await finder()).json()).toMatchObject({ error: { code: "no_team" } });
  });
});

describe("trade performance (12 rosters x 16, 1,000 players, full schedule)", () => {
  it("finder under 2 s and evaluate under 500 ms", () => {
    const h = setup({ rosterCount: 12, rosterSize: 16, playerCount: 1000, schedule: true });
    h.sqlite.prepare("UPDATE leagues SET playoff_teams = 6 WHERE league_id = 'L1'").run();
    insertSchedule(h, 12);
    const values: Record<string, number> = {};
    // Each roster is rich at one position class (by roster number) and thin elsewhere, so
    // complementary trades exist between many pairs.
    for (let n = 1; n <= 192; n += 1) {
      const roster = Math.floor((n - 1) / 16) + 1;
      values[`p${n}`] = (roster % 4 === n % 4 ? 22 : 3) + (n % 5);
    }
    project(h, values);

    const t0 = performance.now();
    const found = ok(findTradesForLeague(h, "L1", SEED_NOW));
    const finderMs = performance.now() - t0;
    const first = found.suggestions[0];

    const give = first?.give.map((p) => p.playerId) ?? ["p1"];
    const get = first?.get.map((p) => p.playerId) ?? ["p17"];
    const t1 = performance.now();
    const ev = ok(
      evaluateTradeForLeague(
        h,
        "L1",
        { otherRosterId: first?.otherRosterId ?? 2, give, get },
        SEED_NOW,
      ),
    );
    const evalMs = performance.now() - t1;
    process.stdout.write(
      `trades perf: finder ${finderMs.toFixed(0)} ms (${String(found.suggestions.length)} suggestions, ${String(found.evaluatedCount)} evaluated), evaluate ${evalMs.toFixed(0)} ms\n`,
    );
    expect(found.suggestions.length).toBeGreaterThanOrEqual(TRADE_FINDER_PLAYOFF_TOP_N);
    expect(ev.mine.playoffPctBefore).not.toBeNull();
    expect(finderMs).toBeLessThan(2000);
    expect(evalMs).toBeLessThan(500);
  });
});
