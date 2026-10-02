import { setSleeperUserId } from "@sideline/db";
import {
  LeagueOverviewSchema,
  PlayerSearchResultSchema,
  StandingsResponseSchema,
  TeamDetailSchema,
} from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  getLeagueOverview,
  getMyTeam,
  getStandings,
  getTeamDetail,
  searchPlayers,
} from "./league-views";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});
function setup(opts: Parameters<typeof seedLeague>[1] = {}) {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, opts);
  return h;
}
function ok<T>(r: { ok: true; data: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

describe("getLeagueOverview", () => {
  it("returns the overview with week and never-synced freshness", () => {
    const h = setup({ divisions: 2 });
    const o = LeagueOverviewSchema.parse(ok(getLeagueOverview(h, "L1", SEED_NOW)));
    expect(o.currentWeek).toBe(5);
    expect(o.hasDivisions).toBe(true);
    expect(o.rosterPositions).toContain("FLEX");
    expect(o.freshness).toEqual({ updatedAt: null, stale: true });
  });
  it("has null week preseason (no nfl state) and is not_found for unknown league", () => {
    const h = setup();
    h.sqlite.prepare("DELETE FROM nfl_state").run();
    expect(ok(getLeagueOverview(h, "L1", SEED_NOW)).currentWeek).toBeNull();
    expect(getLeagueOverview(h, "nope", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });
  it("reports freshness from the league job", () => {
    const h = setup();
    h.sqlite
      .prepare(
        "INSERT INTO sync_runs (job, started_at, finished_at, status) VALUES ('league', ?, ?, 'success')",
      )
      .run("2026-10-02T11:00:00.000Z", "2026-10-02T11:30:00.000Z");
    const o = ok(getLeagueOverview(h, "L1", SEED_NOW));
    expect(o.freshness).toEqual({ updatedAt: "2026-10-02T11:30:00.000Z", stale: false });
  });
});

describe("getStandings", () => {
  it("ranks by wins, ties, points and falls back to roster id on equal records", () => {
    const h = setup({ rosterCount: 4 });
    h.sqlite.prepare("UPDATE rosters SET wins = 2, losses = 1, ties = 0, fpts = 50").run();
    h.sqlite.prepare("UPDATE rosters SET fpts = 80 WHERE roster_id = 3").run();
    const s = StandingsResponseSchema.parse(ok(getStandings(h, "L1", SEED_NOW)));
    expect(s.rows.map((r) => r.rosterId)).toEqual([3, 1, 2, 4]);
    expect(s.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("applies team name fallback order", () => {
    const h = setup({ rosterCount: 3 });
    h.sqlite.prepare("UPDATE league_users SET team_name = '   ' WHERE user_id = 'u2'").run();
    h.sqlite.prepare("UPDATE rosters SET owner_id = NULL WHERE roster_id = 3").run();
    const rows = ok(getStandings(h, "L1", SEED_NOW)).rows;
    const name = (id: number) => rows.find((r) => r.rosterId === id)?.teamName;
    expect(name(1)).toBe("Manager 1"); // no team name
    expect(name(2)).toBe("Manager 2"); // blank team name
    expect(name(3)).toBe("Team 3"); // orphaned roster
  });
  it("marks my roster, and none when no user is stored", () => {
    const h = setup();
    expect(ok(getStandings(h, "L1", SEED_NOW)).rows.some((r) => r.isMine)).toBe(false);
    setSleeperUserId(h, "u2");
    const rows = ok(getStandings(h, "L1", SEED_NOW)).rows;
    expect(rows.filter((r) => r.isMine).map((r) => r.rosterId)).toEqual([2]);
    expect(rows.every((r) => r.division === null)).toBe(true);
  });
  it("is not_found for an unknown league", () => {
    const h = setup();
    expect(getStandings(h, "zzz", SEED_NOW).ok).toBe(false);
  });
});

describe("getTeamDetail and getMyTeam", () => {
  it("labels starters, reports empty slots, bench, ir, taxi and unknown players", () => {
    const h = setup({ rosterCount: 2, rosterSize: 8 });
    // starters p1..p5 (QB RB WR TE FLEX); empty FLEX, unknown id, reserve and taxi.
    h.sqlite
      .prepare(
        `UPDATE rosters SET players_json = ?, starters_json = ?, reserve_json = ?, taxi_json = ?
         WHERE roster_id = 1`,
      )
      .run(
        JSON.stringify(["p1", "p2", "p3", "p4", "ghost", "p6", "p7", "p8"]),
        JSON.stringify(["p1", "p2", "p3", "p4", "0"]),
        JSON.stringify(["p7"]),
        JSON.stringify(["p8"]),
      );
    const d = TeamDetailSchema.parse(ok(getTeamDetail(h, "L1", 1, SEED_NOW)));
    expect(d.emptySlots).toEqual(["FLEX"]);
    const slots = (s: string) => d.players.filter((p) => p.slot === s).map((p) => p.playerId);
    expect(slots("starter")).toEqual(["p1", "p2", "p3", "p4"]);
    expect(d.players.filter((p) => p.slot === "starter").map((p) => p.starterSlot)).toEqual([
      "QB",
      "RB",
      "WR",
      "TE",
    ]);
    expect(slots("bench")).toEqual(["ghost", "p6"]);
    expect(slots("ir")).toEqual(["p7"]);
    expect(slots("taxi")).toEqual(["p8"]);
    const ghost = d.players.find((p) => p.playerId === "ghost");
    expect(ghost).toMatchObject({ name: "ghost", position: null, nflTeam: null, byeWeek: null });
    expect(d.roster.rosterId).toBe(1);
  });
  it("carries status, injury and derives the bye week from the schedule", () => {
    const h = setup({ rosterCount: 2, schedule: true });
    h.sqlite
      .prepare(
        "UPDATE players SET status = 'Active', injury_status = 'Questionable', injury_body_part = 'Knee' WHERE player_id = 'p1'",
      )
      .run();
    const d = ok(getTeamDetail(h, "L1", 1, SEED_NOW));
    const p1 = d.players.find((p) => p.playerId === "p1");
    expect(p1).toMatchObject({
      injuryStatus: "Questionable",
      injuryBodyPart: "Knee",
      status: "Active",
    });
    // p1 is team T02 (index 1): bye week 5 + floor(1/2) % 9 = 5.
    expect(p1?.nflTeam).toBe("T02");
    expect(p1?.byeWeek).toBe(5);
  });
  it("leaves the bye null when the schedule is partial", () => {
    const h = setup({ rosterCount: 2 });
    h.sqlite
      .prepare(
        "INSERT INTO schedule (season, week, game_id, game_type, home, away) VALUES (2026, 1, 'a', 'REG', 'T02', 'T03'), (2026, 3, 'b', 'REG', 'T04', 'T05')",
      )
      .run();
    const d = ok(getTeamDetail(h, "L1", 1, SEED_NOW));
    expect(d.players.every((p) => p.byeWeek === null)).toBe(true);
  });
  it("is not_found for unknown league and unknown roster", () => {
    const h = setup();
    expect(getTeamDetail(h, "nope", 1, SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
    expect(getTeamDetail(h, "L1", 99, SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
    expect(getMyTeam(h, "nope", SEED_NOW)).toEqual({ ok: false, reason: "not_found" });
  });
  it("my team resolves through the stored user id; no_team otherwise", () => {
    const h = setup();
    expect(getMyTeam(h, "L1", SEED_NOW)).toEqual({ ok: false, reason: "no_team" }); // no stored user
    setSleeperUserId(h, "stranger");
    expect(getMyTeam(h, "L1", SEED_NOW)).toEqual({ ok: false, reason: "no_team" }); // no roster here
    setSleeperUserId(h, "u3");
    const d = ok(getMyTeam(h, "L1", SEED_NOW));
    expect(d.roster.rosterId).toBe(3);
    expect(d.roster.isMine).toBe(true);
  });
  it("a user owning two rosters gets the lowest roster_id, deterministically", () => {
    const h = setup();
    h.sqlite
      .prepare("UPDATE rosters SET owner_id = 'u2' WHERE league_id = 'L1' AND roster_id = 3")
      .run();
    setSleeperUserId(h, "u2");
    expect(ok(getMyTeam(h, "L1", SEED_NOW)).roster.rosterId).toBe(2);
    const rows = ok(getStandings(h, "L1", SEED_NOW)).rows;
    expect(rows.filter((r) => r.isMine).map((r) => r.rosterId)).toEqual([2]);
  });
});

describe("searchPlayers", () => {
  it("ranks word-prefix matches first, then search_rank (nulls last), with owners", () => {
    const h = setup({ rosterCount: 2, rosterSize: 3, playerCount: 12 });
    const upd = h.sqlite.prepare(
      "UPDATE players SET full_name = ?, search_rank = ? WHERE player_id = ?",
    );
    upd.run("Sam Brown", 5, "p1");
    upd.run("Tom Browne", null, "p2");
    upd.run("Abe Brownlee", 1, "p3");
    upd.run("Zed Imbrown", 2, "p9"); // substring only, free agent
    upd.run("Ann Brown", 3, "p10");
    h.sqlite.prepare("UPDATE rosters SET reserve_json = '[\"p2\"]' WHERE roster_id = 1").run();
    const r = z.array(PlayerSearchResultSchema).parse(ok(searchPlayers(h, "L1", "BROWN", 10)));
    expect(r.map((x) => x.playerId)).toEqual(["p3", "p10", "p1", "p2", "p9"]);
    expect(r.find((x) => x.playerId === "p9")?.owner).toBeNull(); // free agent
    expect(r.find((x) => x.playerId === "p1")?.owner).toEqual({
      rosterId: 1,
      teamName: "Manager 1",
    });
    expect(r.find((x) => x.playerId === "p2")?.owner?.rosterId).toBe(1); // reserve counts
    expect(ok(searchPlayers(h, "L1", "brown", 2))).toHaveLength(2);
  });
  it("matches wildcard characters literally and handles unknown league", () => {
    const h = setup();
    expect(ok(searchPlayers(h, "L1", "%_", 5))).toEqual([]);
    expect(searchPlayers(h, "nope", "ab", 5).ok).toBe(false);
  });
});
