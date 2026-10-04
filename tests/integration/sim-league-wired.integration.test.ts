import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dbPathFromDataDir,
  openDb,
  readPlayers,
  type DbHandle,
} from "../../packages/db/src/index.js";
import {
  simulateMatchup,
  weeklyStandardDeviation,
  type SimStarter,
  type SimTeam,
} from "../../packages/core/src/index.js";
import { getMatchup } from "../../apps/web/lib/server/matchup.js";
import { getLeagueIntelligence } from "../../apps/web/lib/server/league-intelligence.js";
import { getRosterStrength } from "../../apps/web/lib/server/roster-strength.js";
import { readHistory, readPositionCv, readProjections } from "../../apps/web/lib/server/lineup.js";

/**
 * T5.6 (PLAN 9 Phase 5 table; G5 phase check): determinism, symmetry, and the playoff-odds sum
 * invariant for the WIRED data functions (`getMatchup`, `getLeagueIntelligence`,
 * `getRosterStrength`), against the real recorded fixture league (`tests/fixtures/README.md`),
 * not synthetic/mocked inputs. The pure math these functions delegate to
 * (`simulateMatchup`/`simulatePlayoffOdds`) already has its own determinism/symmetry/sum-invariant
 * unit tests in `packages/core`; this file exercises the real DB reads, seed derivation, and
 * `computed_cache` read-through path end to end instead.
 *
 * Also hosts the G5 phase check's informational Brier-score calibration (requirement 6): see the
 * "calibration" describe block below for why the current single-snapshot fixture cannot support
 * a meaningful number, with concrete evidence.
 */
const LEAGUE_ID = "1000000000000000001";
const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "tests/fixtures/sleeper/manifest.json"), "utf8"),
) as {
  season: string;
  recordedAt: string;
  currentWeek: number;
  partialWeeks: readonly number[];
  weeks: readonly number[];
};
const SEASON = Number(manifest.season);
const NOW = new Date(manifest.recordedAt);
// This league's real pairing for the fixture's current week (confirmed against the seeded DB:
// matchups table, week 4, matchup_id 5 pairs roster 4 with roster 3). Roster 4 is the fixture
// identity's own team (tests/fixtures/README.md).
const MY_ROSTER_ID = 4;
const OPPONENT_ROSTER_ID = 3;
const CURRENT_WEEK = manifest.currentWeek;

let dataDir = "";
let handle: DbHandle;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "sideline-sim-league-"));
  const seed = spawnSync("pnpm", ["db:seed:fixtures"], {
    cwd: repoRoot,
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: "utf8",
  });
  if (seed.status !== 0) throw new Error(`fixture seed failed:\n${seed.stdout}\n${seed.stderr}`);
  handle = openDb(dbPathFromDataDir(dataDir));
}, 120_000);

afterAll(() => {
  handle?.sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Structurally unwraps any of this codebase's per-module `Lookup<T>` result types. */
function unwrap<T>(r: { ok: true; data: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

function clearCache(): void {
  handle.sqlite.prepare("DELETE FROM computed_cache").run();
}

describe("T5.6 req 1: determinism of the wired data functions on the real fixture DB", () => {
  it("getMatchup: a cache hit and a cleared-cache recomputation both reproduce the first result exactly", () => {
    clearCache();
    const first = unwrap(
      getMatchup(handle, LEAGUE_ID, { week: CURRENT_WEEK, rosterId: MY_ROSTER_ID }, NOW),
    );
    const cacheHit = unwrap(
      getMatchup(handle, LEAGUE_ID, { week: CURRENT_WEEK, rosterId: MY_ROSTER_ID }, NOW),
    );
    expect(cacheHit).toEqual(first);

    clearCache();
    const recomputed = unwrap(
      getMatchup(handle, LEAGUE_ID, { week: CURRENT_WEEK, rosterId: MY_ROSTER_ID }, NOW),
    );
    expect(recomputed).toEqual(first);
  });

  it("getRosterStrength: a cache hit and a cleared-cache recomputation both reproduce the first result exactly", () => {
    clearCache();
    const first = unwrap(getRosterStrength(handle, LEAGUE_ID, NOW));
    const cacheHit = unwrap(getRosterStrength(handle, LEAGUE_ID, NOW));
    expect(cacheHit).toEqual(first);

    clearCache();
    const recomputed = unwrap(getRosterStrength(handle, LEAGUE_ID, NOW));
    expect(recomputed).toEqual(first);
  });

  it("getLeagueIntelligence: a cache hit and a cleared-cache recomputation both reproduce the first result exactly", () => {
    clearCache();
    const first = unwrap(getLeagueIntelligence(handle, LEAGUE_ID, NOW));
    const cacheHit = unwrap(getLeagueIntelligence(handle, LEAGUE_ID, NOW));
    expect(cacheHit).toEqual(first);

    clearCache();
    const recomputed = unwrap(getLeagueIntelligence(handle, LEAGUE_ID, NOW));
    expect(recomputed).toEqual(first);
  });
});

describe("T5.6 req 2 (SIM-2): getMatchup symmetry on the real fixture DB", () => {
  it("P(roster 4 wins) from roster 4's own call approximately equals P(roster 4 wins) from roster 3's call", () => {
    clearCache();
    const fromMine = unwrap(
      getMatchup(handle, LEAGUE_ID, { week: CURRENT_WEEK, rosterId: MY_ROSTER_ID }, NOW),
    );
    const fromOpponent = unwrap(
      getMatchup(handle, LEAGUE_ID, { week: CURRENT_WEEK, rosterId: OPPONENT_ROSTER_ID }, NOW),
    );
    expect(fromMine.team.rosterId).toBe(MY_ROSTER_ID);
    expect(fromMine.opponent.rosterId).toBe(OPPONENT_ROSTER_ID);
    expect(fromOpponent.team.rosterId).toBe(OPPONENT_ROSTER_ID);
    expect(fromOpponent.opponent.rosterId).toBe(MY_ROSTER_ID);

    // These are two INDEPENDENT 10,000-iteration Monte Carlo runs (matchup.ts's `deriveSeed`
    // includes `rosterId`, so each call draws from a different seeded stream), not the same run
    // read twice -- real Monte Carlo sampling error applies. Tolerance matches
    // `packages/core/src/sim/matchup.test.ts`'s own symmetry test exactly, for the same reason
    // that test gives: the binomial standard error of a win-probability estimate from n = 10,000
    // iterations is at most sqrt(0.25 / 10,000) = 0.005 (maximized at p = 0.5), so 4 standard
    // errors of slack is 0.02 -- generous enough to never flake, tight enough to catch a real
    // asymmetry bug (e.g. a seed derivation that accidentally ignores `rosterId`).
    const TOLERANCE = 0.02;
    expect(Math.abs(fromMine.winProbability - fromOpponent.opponentWinProbability)).toBeLessThan(
      TOLERANCE,
    );
    expect(Math.abs(fromMine.opponentWinProbability - fromOpponent.winProbability)).toBeLessThan(
      TOLERANCE,
    );
  });
});

describe("T5.6 req 3 (LEAGUE-5): playoff odds sum on the real fixture DB", () => {
  it("sum(playoffPct) across every team is within 0.5% of playoffTeams, through real standings/roster-strength/schedule", () => {
    clearCache();
    const data = unwrap(getLeagueIntelligence(handle, LEAGUE_ID, NOW));
    // This league's real `playoff_teams` setting (confirmed in the seeded DB: 6 of 10 teams).
    expect(data.playoffTeams).not.toBeNull();
    const playoffTeams = data.playoffTeams ?? 0;
    expect(playoffTeams).toBeGreaterThan(0);
    const sum = data.teams.reduce((acc, t) => acc + (t.playoffOdds?.playoffPct ?? 0), 0);
    // Same 0.5%-of-playoffTeams relative tolerance as the pure `simulatePlayoffOdds` unit test
    // (packages/core/src/league/playoff-odds.test.ts: `Math.abs(sum - 2)).toBeLessThan(0.005 * 2)`).
    expect(Math.abs(sum - playoffTeams)).toBeLessThan(0.005 * playoffTeams);
  });
});

// ---------------------------------------------------------------------------------------------
// T5.6 req 6 (G5 phase check, informational): Brier score of pregame win probabilities.
// ---------------------------------------------------------------------------------------------

interface StringListJson {
  [index: number]: string;
}

function parseStarters(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as StringListJson;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => id !== "0") : [];
  } catch {
    return [];
  }
}

interface RealMatchup {
  week: number;
  matchupId: number;
  rosterIdA: number;
  rosterIdB: number;
  startersA: string[];
  startersB: string[];
  pointsA: number;
  pointsB: number;
}

/** Every real, paired matchup for a completed week, from the seeded fixture's own recorded data
 * (`matchups` table), not synthetic. */
function readRealMatchups(h: DbHandle, leagueId: string, week: number): RealMatchup[] {
  const rows = h.sqlite
    .prepare(
      `SELECT roster_id AS rosterId, matchup_id AS matchupId, starters_json AS startersJson, points
       FROM matchups WHERE league_id = ? AND week = ? AND matchup_id IS NOT NULL
       ORDER BY matchup_id, roster_id`,
    )
    .all(leagueId, week) as {
    rosterId: number;
    matchupId: number;
    startersJson: string;
    points: number;
  }[];
  const byMatchupId = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = byMatchupId.get(r.matchupId) ?? [];
    arr.push(r);
    byMatchupId.set(r.matchupId, arr);
  }
  const out: RealMatchup[] = [];
  for (const [matchupId, pair] of byMatchupId) {
    if (pair.length !== 2) continue; // a bye or data anomaly; skip rather than guess a pairing.
    const [a, b] = pair as [(typeof rows)[number], (typeof rows)[number]];
    out.push({
      week,
      matchupId,
      rosterIdA: a.rosterId,
      rosterIdB: b.rosterId,
      startersA: parseStarters(a.startersJson),
      startersB: parseStarters(b.startersJson),
      pointsA: a.points,
      pointsB: b.points,
    });
  }
  return out;
}

/** FNV-1a 32-bit, mirroring `matchup.ts`'s private (unexported) `deriveSeed` exactly, so this
 * pregame-only recomputation uses the same deterministic seed derivation the real wired path
 * would for this league/week/roster. */
function deriveSeed(leagueId: string, week: number, rosterId: number): number {
  const payload = `${leagueId}:${String(week)}:${String(rosterId)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Builds a genuinely "pregame" `SimTeam`: every starter is forced to `status: "not_started"` and
 * drawn from their stored projection (`league_player_week_points.proj_pts`), even for a week whose
 * actual results are already known in the DB. This deliberately bypasses `getMatchup`'s own
 * "finished" logic (which keys off whether a stats row exists for the week, not off "now") --
 * that logic is correct for showing a live in-season matchup, but would make every past week's
 * win probability degenerate (0 or 1, reflecting the already-known result) if reused here for
 * calibration. Returns `null` if any starter has no stored projection for this week (the
 * "unusable" case -- see the describe block's doc comment).
 */
function buildPregameTeam(
  rosterId: number,
  starters: readonly string[],
  projections: ReadonlyMap<string, number>,
  history: ReadonlyMap<string, number[]>,
  positionCv: ReadonlyMap<string, number>,
  positionOf: ReadonlyMap<string, string | null>,
): SimTeam | null {
  const simStarters: SimStarter[] = [];
  for (const playerId of starters) {
    const proj = projections.get(playerId);
    if (proj === undefined) return null; // no stored pregame projection: this matchup is unusable.
    const weeklyPoints = history.get(playerId) ?? [];
    const position = positionOf.get(playerId) ?? null;
    const cv = position !== null ? (positionCv.get(position) ?? 0) : 0;
    const { sd } = weeklyStandardDeviation({ weeklyPoints, positionCv: cv, proj });
    simStarters.push({ playerId, mean: proj, sd, status: "not_started" });
  }
  return { rosterId: String(rosterId), starters: simStarters };
}

describe("T5.6 req 6 (G5 phase check, informational): Brier score of pregame win probabilities", () => {
  it("computes a Brier score over usable completed weeks, or documents concretely why the fixture has none", () => {
    // ADR-000 item 9 / brief-rules.md: partial weeks are excluded from golden expectations and
    // SCORE-2 validation; the same rule applies here -- a "pregame vs. actual" calibration check
    // is meaningless for a week whose actual results are not yet final.
    const completedWeeks = manifest.weeks.filter((w) => !manifest.partialWeeks.includes(w));
    expect(completedWeeks.length).toBeGreaterThan(0); // sanity: the fixture has completed weeks at all.

    const positionCv = readPositionCv(handle, LEAGUE_ID, SEASON);
    const brierTerms: number[] = [];
    let totalMatchups = 0;
    let unusableMatchups = 0;
    const coverageByWeek: { week: number; totalStarterSlots: number; withStoredProj: number }[] =
      [];

    for (const week of completedWeeks) {
      const matchups = readRealMatchups(handle, LEAGUE_ID, week);
      const allIdsThisWeek = new Set<string>();
      for (const m of matchups) {
        for (const id of [...m.startersA, ...m.startersB]) allIdsThisWeek.add(id);
      }
      const projections = readProjections(handle, LEAGUE_ID, SEASON, week, [...allIdsThisWeek]);
      coverageByWeek.push({
        week,
        totalStarterSlots: allIdsThisWeek.size,
        withStoredProj: [...allIdsThisWeek].filter((id) => projections.has(id)).length,
      });
      const history = readHistory(handle, LEAGUE_ID, SEASON, week, [...allIdsThisWeek]);
      const players = readPlayers(handle, [...allIdsThisWeek]);
      const positionOf = new Map(players.map((p) => [p.playerId, p.position] as const));

      for (const m of matchups) {
        totalMatchups += 1;
        const teamA = buildPregameTeam(
          m.rosterIdA,
          m.startersA,
          projections,
          history,
          positionCv,
          positionOf,
        );
        const teamB = buildPregameTeam(
          m.rosterIdB,
          m.startersB,
          projections,
          history,
          positionCv,
          positionOf,
        );
        if (teamA === null || teamB === null) {
          unusableMatchups += 1;
          continue;
        }
        const seed = deriveSeed(LEAGUE_ID, week, m.rosterIdA);
        const sim = simulateMatchup({ teamA, teamB, seed });
        const outcome = m.pointsA > m.pointsB ? 1 : m.pointsA < m.pointsB ? 0 : 0.5;
        brierTerms.push((sim.winProbabilityTeamA - outcome) ** 2);
      }
    }

    if (brierTerms.length > 0) {
      const brier = brierTerms.reduce((a, b) => a + b, 0) / brierTerms.length;
      process.stdout.write(
        `G5 BRIER SCORE (informational, SIM pregame win probability calibration): ` +
          `${brier.toFixed(4)} over ${String(brierTerms.length)} completed matchups ` +
          `(0 = perfect, 0.25 = always guessing 50%, 1 = perfectly wrong)\n`,
      );
      expect(brier).toBeGreaterThanOrEqual(0);
      expect(brier).toBeLessThanOrEqual(1);
    } else {
      // The real, verified reason (not a guess): the production sync job only ever stores
      // `proj_pts` for the current and next NFL week (confirmed directly against this fixture's
      // seeded `league_player_week_points`: weeks 1-3 have 0 non-null `proj_pts` out of
      // hundreds of rows each, because those weeks are already in the past relative to the
      // fixture's recording time; weeks 4-5 have 100% `proj_pts` coverage but week 4 is partial
      // (no actuals yet, ADR-000 item 9) and week 5 is in the future (no actuals at all). So no
      // week in this single-snapshot fixture ever has BOTH a stored pregame projection and a
      // known final outcome at once -- not "too small a sample", but zero computable samples.
      // In real production use this is not a problem: the worker runs daily and
      // `player_week_projection_snapshots` accumulates real pregame history for each week over
      // the days before it starts (confirmed by that table's own schema and `upsertProjectionSnapshots`),
      // so a real `./data` database naturally has what this one-shot fixture cannot. Per ADR-009
      // this test may only use fixture-seeded temp data, never the real `./data`, so this
      // genuine limitation is documented here rather than worked around with synthetic numbers.
      const summary = coverageByWeek
        .map(
          (c) =>
            `week ${String(c.week)}: ${String(c.withStoredProj)}/${String(c.totalStarterSlots)} starters have a stored projection`,
        )
        .join("; ");
      process.stdout.write(
        `G5 BRIER SCORE (informational): not computable from this fixture. 0 of ${String(totalMatchups)} ` +
          `completed-week matchups have a stored pregame projection for every starter on both ` +
          `sides (${String(unusableMatchups)} unusable). ${summary}. The single-snapshot fixture ` +
          `never has both a stored projection and a known actual result for the same week; a real ` +
          `./data database accumulates that history naturally over many days and would support a ` +
          `meaningful number. See this test file's comment for the full explanation.\n`,
      );
      // A tripwire, not a weakened threshold: this locks in today's verified root cause (zero
      // projection coverage for every completed week in this fixture) so that a future
      // re-recording of the fixture that happens to add projection coverage for a completed week
      // is noticed here and prompts wiring up the real Brier computation above, rather than this
      // check silently staying a no-op forever.
      expect(coverageByWeek.every((c) => c.withStoredProj === 0)).toBe(true);
      expect(brierTerms.length).toBe(0);
    }
  });
});
