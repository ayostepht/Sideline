/**
 * Integrity tests for the committed, sanitized fixtures in tests/fixtures/sleeper/.
 * Uses ONLY the fixture files (no network, no raw cache). Skipped checks are not allowed: if the
 * fixtures are missing, these tests fail loudly so the recorder gets run.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSleeperServer, recordedFixtureRoot } from "../../tests/msw/server";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "sleeper");

function load<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;
}

interface Manifest {
  leagueId: string;
  season: string;
  currentWeek: number;
  weeks: number[];
  partialWeeks: number[];
  futureMatchupWeeks: number[];
  projectionWeeks: number[];
  statsWeeks: number[];
  recordedAt: string;
  sanitizerVersion: number;
  username: string;
  userId: string;
  draftIds: string[];
  trimming: { players: { keptCount: number; fields: string[] } };
}

interface MatchupRow {
  roster_id: number;
  starters: string[];
  players_points: Record<string, number>;
  points: number;
  starters_points: number[];
}

interface StatsRow {
  player_id: string;
  stats: Record<string, number>;
}

const manifest = load<Manifest>("manifest.json");
const leagueBase = `v1/league/${manifest.leagueId}`;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

describe("manifest", () => {
  it("lists completed and partial weeks", () => {
    expect(manifest.weeks).toEqual([1, 2, 3]);
    expect(manifest.partialWeeks).toEqual([4]);
    expect(manifest.currentWeek).toBe(4);
    expect(manifest.futureMatchupWeeks).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(manifest.leagueId).toMatch(/^1000\d{15}$/);
    expect(Number.isNaN(Date.parse(manifest.recordedAt))).toBe(false);
    expect(manifest.sanitizerVersion).toBeGreaterThanOrEqual(1);
  });

  it("has every file the manifest promises", () => {
    for (const w of [...manifest.weeks, ...manifest.partialWeeks, ...manifest.futureMatchupWeeks]) {
      expect(Array.isArray(load(`${leagueBase}/matchups/${w}.json`))).toBe(true);
    }
    for (const w of manifest.projectionWeeks) load(`projections/${manifest.season}/${w}.json`);
    for (const w of manifest.statsWeeks) load(`stats/${manifest.season}/${w}.json`);
    for (const id of manifest.draftIds) load(`v1/draft/${id}/picks.json`);
    load(`v1/user/${manifest.username}.json`);
    load(`v1/user/${manifest.userId}/leagues/nfl/${manifest.season}.json`);
  });
});

describe("sanitized shape", () => {
  const text = listFiles(ROOT)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: readFileSync(f, "utf8") }));

  it("has no unfaked 16+ digit ids or email, phone and token keys anywhere", () => {
    // Weekly rows carry public player metadata (for example a public channel_id), so only the
    // league, user and draft documents are held to the fake id format.
    const leagueDocs = text.filter(
      ({ f }) => !/[\\/](projections|stats)[\\/]/.test(f) && !f.endsWith("nfl.json"),
    );
    expect(leagueDocs.length).toBeGreaterThan(30);
    for (const { f, t } of leagueDocs) {
      for (const m of t.matchAll(/(?<![A-Za-z0-9])\d{16,}/g))
        expect(m[0], f).toMatch(/^(1000\d{14,15}|10000000000000000\d)$/);
    }
    for (const { f, t } of text) {
      expect(t, f).not.toMatch(/"(email|phone|token|cookies|real_name)"/);
    }
  });

  it("only has fake display names, usernames and team names", () => {
    const users = load<Record<string, unknown>[]>(`${leagueBase}/users.json`);
    expect(users).toHaveLength(10);
    for (const u of users) {
      expect(u.display_name).toMatch(/^manager_\d{2}$/);
      const meta = u.metadata as Record<string, unknown>;
      if (meta.team_name !== undefined) expect(meta.team_name).toMatch(/^Team \d{2}$/);
      if (meta.avatar !== undefined) expect(meta.avatar).toMatch(/^https:\/\/example\.com\//);
    }
    // The missing-team-name edge case survives.
    expect(users.some((u) => (u.metadata as Record<string, unknown>).team_name === undefined)).toBe(
      true,
    );
    expect(load<{ name: string }>(`${leagueBase}.json`).name).toBe("Example League");
    expect(
      Object.keys(load<Record<string, unknown>>(`v1/user/${manifest.username}.json`)).sort(),
    ).toEqual(["avatar", "display_name", "is_bot", "user_id", "username"]);
  });

  it("keeps the primary league plus one synthetic league in the user league list", () => {
    const leagues = load<{ league_id: string; name: string }[]>(
      `v1/user/${manifest.userId}/leagues/nfl/${manifest.season}.json`,
    );
    expect(leagues.map((l) => l.name)).toEqual(["Example League", "Example League 2"]);
    expect(leagues[0]?.league_id).toBe(manifest.leagueId);
  });

  it("keeps public data intact", () => {
    const rosters = load<{ roster_id: number; players: string[] }[]>(`${leagueBase}/rosters.json`);
    expect(rosters.map((r) => r.roster_id).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const players = load<Record<string, { position: string }>>("v1/players/nfl.json");
    const defs = Object.values(players).filter((p) => p.position === "DEF");
    expect(defs).toHaveLength(32);
    for (const r of rosters) for (const p of r.players) expect(players[p], p).toBeDefined();
  });

  it("stays under the size budget", () => {
    const bytes = listFiles(ROOT).reduce((sum, f) => sum + statSync(f).size, 0);
    expect(bytes).toBeLessThan(6 * 1024 * 1024);
  });
});

describe("scoring sanity from fixtures only", () => {
  it("recomputed sum(stats * scoring) matches players_points for every starter in weeks 1 to 3", () => {
    const scoring = load<{ scoring_settings: Record<string, number> }>(
      `${leagueBase}.json`,
    ).scoring_settings;
    let starters = 0;
    let matched = 0;
    let allEntries = 0;
    let allMatched = 0;
    for (const week of manifest.weeks) {
      const stats = new Map(
        load<StatsRow[]>(`stats/${manifest.season}/${week}.json`).map((r) => [
          r.player_id,
          r.stats,
        ]),
      );
      const recompute = (id: string): number => {
        const s = stats.get(id) ?? {};
        let total = 0;
        for (const [k, v] of Object.entries(scoring)) total += (s[k] ?? 0) * v;
        return Math.round(total * 100) / 100;
      };
      for (const row of load<MatchupRow[]>(`${leagueBase}/matchups/${week}.json`)) {
        for (const id of row.starters) {
          starters += 1;
          if (Math.abs(recompute(id) - (row.players_points[id] ?? Number.NaN)) <= 0.01)
            matched += 1;
        }
        for (const [id, pts] of Object.entries(row.players_points)) {
          allEntries += 1;
          if (Math.abs(recompute(id) - pts) <= 0.01) allMatched += 1;
        }
      }
    }
    expect(starters).toBe(300);
    expect(matched).toBe(starters);
    expect(allMatched).toBe(allEntries);
  });
});

describe("served by the MSW handlers", () => {
  const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it("returns 200 for league, users, matchups, projections and players", async () => {
    const base = "https://api.sleeper.app";
    const urls = [
      `${base}/v1/state/nfl`,
      `${base}/v1/league/${manifest.leagueId}`,
      `${base}/v1/league/${manifest.leagueId}/users`,
      `${base}/v1/league/${manifest.leagueId}/rosters`,
      `${base}/v1/league/${manifest.leagueId}/matchups/3`,
      `${base}/v1/league/${manifest.leagueId}/transactions/2`,
      `${base}/v1/league/${manifest.leagueId}/drafts`,
      `${base}/v1/draft/${manifest.draftIds[0] ?? ""}/picks`,
      `${base}/v1/user/${manifest.username}`,
      `${base}/v1/user/${manifest.userId}/leagues/nfl/${manifest.season}`,
      `${base}/v1/players/nfl/trending/add?lookback_hours=24&limit=50`,
      `${base}/projections/nfl/${manifest.season}/4?season_type=regular&position[]=QB`,
      `${base}/stats/nfl/${manifest.season}/3?season_type=regular`,
      `${base}/v1/players/nfl`,
    ];
    for (const url of urls) {
      const res = await fetch(url);
      expect(res.status, url).toBe(200);
      await res.json();
    }
    expect(server.mock.unhandled).toEqual([]);
  });
});
