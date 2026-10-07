import { matchupGrade } from "@sideline/core";
import { schema, type DbHandle } from "@sideline/db";
import { PlayerDetailResponseSchema, NextOpponentsSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { readDefenseVsPosition } from "./lineup";
import { nextOpponentsFor } from "./next-opponents";
import { getPlayerDetail } from "./players";
import { SEED_NOW, seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

// Seed: nflState week 5. p4 is a QB on T05, whose bye is week 7. p2 is a RB on T03 (bye week 6).
function setup(): DbHandle {
  tmp = useTempDb({ migrated: true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  seedLeague(h, { schedule: true });
  return h;
}

function player(h: DbHandle, id: string) {
  const p = h.sqlite.prepare("SELECT position, team FROM players WHERE player_id = ?").get(id) as {
    position: string | null;
    team: string | null;
  };
  return p;
}

function seedDvp(h: DbHandle, position: string, easiest: string): void {
  for (let t = 1; t <= 32; t += 1) {
    const team = `T${String(t).padStart(2, "0")}`;
    h.db
      .insert(schema.defenseVsPosition)
      .values({
        leagueId: "L1",
        season: 2026,
        throughWeek: 4,
        team,
        position,
        ptsAllowedPg: team === easiest ? 99 : 10 + t / 10,
        games: 4,
      })
      .run();
  }
}

describe("nextOpponentsFor", () => {
  it("lists 4 weeks with a bye in the middle and null grades when DvP is missing", () => {
    const h = setup();
    const r = nextOpponentsFor(h, "L1", 2026, player(h, "p4"), SEED_NOW);
    expect(NextOpponentsSchema.safeParse(r).success).toBe(true);
    expect(r.reasonUnavailable).toBeNull();
    expect(r.weeks.map((w) => w.week)).toEqual([5, 6, 7, 8]);
    expect(r.weeks.map((w) => w.bye)).toEqual([false, false, true, false]);
    expect(r.weeks[2]?.opponent).toBeNull();
    expect(r.weeks[0]?.opponent).not.toBeNull();
    expect(typeof r.weeks[0]?.home).toBe("boolean");
    for (const w of r.weeks) {
      expect(w.grade).toBeNull();
      expect(w.rank).toBeNull();
    }
  });

  it("starts at the next week once the current week's game has kicked off", () => {
    const h = setup();
    h.sqlite
      .prepare("UPDATE schedule SET kickoff_utc = ? WHERE season = 2026 AND week = 5")
      .run("2026-10-01T00:00:00.000Z");
    const r = nextOpponentsFor(h, "L1", 2026, player(h, "p4"), SEED_NOW);
    expect(r.weeks[0]?.week).toBe(6);
  });

  it("truncates at the end of the regular season", () => {
    const h = setup();
    h.sqlite.prepare("UPDATE nfl_state SET week = 17 WHERE id = 1").run();
    const r = nextOpponentsFor(h, "L1", 2026, player(h, "p4"), SEED_NOW);
    expect(r.weeks.map((w) => w.week)).toEqual([17, 18]);
  });

  it("returns no weeks and a reason for a player without a team", () => {
    const h = setup();
    expect(nextOpponentsFor(h, "L1", 2026, { position: "QB", team: null }, SEED_NOW)).toEqual({
      weeks: [],
      reasonUnavailable: "No team",
    });
  });

  it("returns no weeks and a reason for K and DEF", () => {
    const h = setup();
    for (const position of ["K", "DEF"]) {
      const r = nextOpponentsFor(h, "L1", 2026, { position, team: "T05" }, SEED_NOW);
      expect(r.weeks).toEqual([]);
      expect(r.reasonUnavailable).toBe("Not graded for kickers and defenses");
    }
  });

  it("grades an easy defense A and matches lineup.ts ordering and numbers", () => {
    const h = setup();
    const p = player(h, "p4");
    const base = nextOpponentsFor(h, "L1", 2026, p, SEED_NOW);
    const firstOpp = base.weeks[0]?.opponent;
    if (firstOpp === undefined || firstOpp === null) throw new Error("opp");
    seedDvp(h, "QB", firstOpp);
    const r = nextOpponentsFor(h, "L1", 2026, p, SEED_NOW);
    const w = r.weeks[0];
    expect(w?.rank).toBe(1);
    expect(w?.grade).toBe("A");
    expect(w?.gradeLabel).toBe("Great matchup");
    expect(w?.ptsAllowedPg).toBe(99);
    expect(w?.totalTeams).toBe(32);
    // Same numbers lineup.ts would produce for every other opponent.
    const ordered = readDefenseVsPosition(h, "L1", 2026, 18).get("QB") ?? [];
    for (const wk of r.weeks.filter((x) => !x.bye)) {
      const idx = ordered.findIndex((e) => e.team === wk.opponent);
      expect(wk.rank).toBe(idx + 1);
      expect(wk.grade).toBe(matchupGrade(idx + 1, ordered.length).grade);
      expect(wk.ptsAllowedPg).toBe(ordered[idx]?.ptsAllowedPg);
    }
    // The hardest (last-ranked) defense must grade F.
    expect(matchupGrade(32, 32).grade).toBe("F");
  });

  it("getPlayerDetail output parses against the strict schema", () => {
    const h = setup();
    seedDvp(h, "QB", "T01");
    const res = getPlayerDetail(h, "L1", "p4", SEED_NOW);
    if (!res.ok) throw new Error("detail");
    expect(PlayerDetailResponseSchema.safeParse(res.data).success).toBe(true);
    expect(res.data.nextOpponents?.weeks).toHaveLength(4);
  });
});
