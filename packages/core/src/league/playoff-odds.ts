/**
 * LEAGUE-5 (PLAN 5.8, line 245): playoff odds via Monte Carlo simulation of the remaining
 * regular season.
 *
 * Per iteration: starting from each team's current wins/ties/pointsFor, every remaining matchup
 * in the supplied schedule is played out by drawing both teams' scores from
 * `sampleTruncatedNormalAtZero` (`../sim/rng.js`) around that team's `meanWeeklyScore`/`sd` (ROS
 * optimal-lineup projection mean, season weekly-score sd -- both plain numbers supplied by the
 * caller; this module does not import `optimizer/` or `projections/` itself, per the package's
 * established decoupling convention, see ADR-013/ADR-015/ADR-016 item 2 in docs/DECISIONS.md).
 * Higher score wins that matchup (increments that team's simulated wins); an exact tie (a
 * measure-zero event with a continuous distribution, but representable with floating-point
 * draws) increments ties for BOTH teams, matching real fantasy tie scoring. `pointsFor` is
 * accumulated every matchup regardless of win/loss/tie.
 *
 * After all of a given iteration's matchups are played, the final wins/ties/pointsFor records
 * are ranked into 1-based seeds with `compareStandings` (`@sideline/shared`: wins desc, ties
 * desc, pointsFor desc, rosterId asc). That comparator is this codebase's existing standings
 * tiebreak and already matches PLAN's "tiebreaker per league settings, defaulting to points
 * for". Divisions are explicitly out of scope for this module: `compareStandings` itself does
 * not branch on division today (a documented pre-existing gap, see docs/PROGRESS.md backlog),
 * so there is nothing to join against yet.
 *
 * Outputs, per team, averaged across all iterations:
 * - `playoffPct`: fraction of iterations this team's final seed was in the top `playoffTeams`.
 * - `byePct`: fraction of iterations this team's final seed was in the top `firstRoundByeCount`,
 *   or `null` when `firstRoundByeCount` is 0 -- byes don't exist in this league's playoff
 *   bracket format, so reporting a literal 0% would misleadingly imply a bye exists and this
 *   team just isn't getting it.
 * - `seedDistribution`: every possible 1-based seed (1..number of teams) mapped to the fraction
 *   of iterations this team finished there. Always sums to 1 across all seeds for a given team,
 *   since every iteration assigns each team exactly one seed (seeds are a permutation of
 *   1..numTeams within an iteration).
 *
 * Because seeds are a permutation each iteration, exactly `playoffTeams` teams have seed <=
 * `playoffTeams` every single iteration, so `sum(playoffPct across all teams)` is exactly
 * `playoffTeams` (up to floating-point division error), not an approximation that only holds
 * "on average" -- same reasoning applies to `byePct` summing to `firstRoundByeCount`.
 *
 * Zero remaining games (empty `schedule`) is special-cased: nothing is left to simulate, so
 * every iteration would produce an identical result. Rather than burn `iterations` identical
 * passes through the Monte Carlo loop (and consume RNG state for no reason), the current
 * standings are ranked once and every team's `playoffPct`/`byePct`/`seedDistribution` is set
 * deterministically from that single ranking (REQUIREMENT 4).
 */
import type { Reason } from "@sideline/shared";
import { compareStandings } from "@sideline/shared";
import { createRng, sampleTruncatedNormalAtZero } from "../sim/rng.js";

/** Default Monte Carlo iteration count (LEAGUE-5: "simulate the remaining regular season 10,000
 * times"). */
export const DEFAULT_PLAYOFF_ODDS_ITERATIONS = 10000;

export interface PlayoffOddsTeamInput {
  rosterId: number;
  /** Current record to carry forward into the simulation. */
  wins: number;
  ties: number;
  pointsFor: number;
  /** ROS optimal-lineup projection mean weekly score (plain number, caller-supplied; see module
   * doc on the decoupling convention). */
  meanWeeklyScore: number;
  /** Season weekly-score standard deviation (plain number, caller-supplied). */
  sd: number;
}

export interface PlayoffOddsMatchup {
  week: number;
  rosterIdA: number;
  rosterIdB: number;
}

export interface SimulatePlayoffOddsInput {
  teams: readonly PlayoffOddsTeamInput[];
  /** Every remaining matchup to simulate; the caller has already resolved real vs. placeholder
   * pairings per ADR-002 (future-week `matchups/{week}` before `playoff_week_start`, placeholder
   * pairings after). */
  schedule: readonly PlayoffOddsMatchup[];
  /** How many seeds make the playoffs. */
  playoffTeams: number;
  /** How many top seeds get a first-round bye. Defaults to 0 (no byes in this league's playoff
   * bracket format). */
  firstRoundByeCount?: number;
  /** Required seed (CLAUDE.md section 8: RNG seeds are always passed in by the caller). */
  seed: number;
  /** Monte Carlo iteration count. Defaults to {@link DEFAULT_PLAYOFF_ODDS_ITERATIONS}. Any value
   * less than 1 falls back to the default rather than dividing by zero downstream. */
  iterations?: number;
}

export interface PlayoffOddsTeamResult {
  rosterId: number;
  /** Fraction of iterations this team's final seed was in the top `playoffTeams`. */
  playoffPct: number;
  /** Fraction of iterations this team's final seed was in the top `firstRoundByeCount`, or
   * `null` when `firstRoundByeCount` is 0. */
  byePct: number | null;
  /** 1-based seed -> fraction of iterations this team finished at that seed. Sums to 1. */
  seedDistribution: Map<number, number>;
}

export interface SimulatePlayoffOddsResult {
  teams: PlayoffOddsTeamResult[];
  reasons: Reason[];
}

interface StandingsRecord {
  rosterId: number;
  wins: number;
  ties: number;
  pointsFor: number;
}

/** Rank `records` into 1-based seeds with `compareStandings`; returns rosterId -> seed. */
function seedByRosterId(records: readonly StandingsRecord[]): Map<number, number> {
  const ranked = [...records].sort(compareStandings);
  const seeds = new Map<number, number>();
  ranked.forEach((r, i) => seeds.set(r.rosterId, i + 1));
  return seeds;
}

/** Monte Carlo simulation of the remaining regular season into playoff odds (LEAGUE-5). */
export function simulatePlayoffOdds(input: SimulatePlayoffOddsInput): SimulatePlayoffOddsResult {
  const { teams, schedule, playoffTeams, seed } = input;
  const firstRoundByeCount = input.firstRoundByeCount ?? 0;
  const iterations =
    input.iterations !== undefined && input.iterations >= 1
      ? Math.floor(input.iterations)
      : DEFAULT_PLAYOFF_ODDS_ITERATIONS;

  const numTeams = teams.length;
  const rosterIds = teams.map((t) => t.rosterId);

  // Zero remaining games: nothing to simulate, every iteration would be identical (see module
  // doc). Rank the current standings once and assign all probability mass to that outcome.
  if (schedule.length === 0) {
    const seeds = seedByRosterId(teams);
    const reasons: Reason[] = [
      {
        code: "LEAGUE_PLAYOFF_ODDS_NO_REMAINING_GAMES",
        label: "No remaining games to simulate; odds are based on the current standings alone",
        value: 0,
      },
    ];
    const results: PlayoffOddsTeamResult[] = teams.map((t) => {
      const thisSeed = seeds.get(t.rosterId) as number;
      const seedDistribution = new Map<number, number>();
      for (let s = 1; s <= numTeams; s++) {
        seedDistribution.set(s, s === thisSeed ? 1 : 0);
      }
      return {
        rosterId: t.rosterId,
        playoffPct: thisSeed <= playoffTeams ? 1 : 0,
        byePct: firstRoundByeCount > 0 ? (thisSeed <= firstRoundByeCount ? 1 : 0) : null,
        seedDistribution,
      };
    });
    return { teams: results, reasons };
  }

  // Flattened, allocation-free-per-iteration state (same style as `sim/matchup.ts`).
  const startIndex = new Map<number, number>(rosterIds.map((id, i) => [id, i]));
  const startWins = new Float64Array(numTeams);
  const startTies = new Float64Array(numTeams);
  const startPointsFor = new Float64Array(numTeams);
  const meanWeeklyScore = new Float64Array(numTeams);
  const sd = new Float64Array(numTeams);
  teams.forEach((t, i) => {
    startWins[i] = t.wins;
    startTies[i] = t.ties;
    startPointsFor[i] = t.pointsFor;
    meanWeeklyScore[i] = t.meanWeeklyScore;
    sd[i] = t.sd;
  });

  const matchupA: number[] = [];
  const matchupB: number[] = [];
  schedule.forEach((m, i) => {
    const a = startIndex.get(m.rosterIdA);
    const b = startIndex.get(m.rosterIdB);
    if (a === undefined || b === undefined) {
      throw new Error(
        `simulatePlayoffOdds: schedule entry at index ${i} (week ${m.week}) references a rosterId not present in teams`,
      );
    }
    matchupA.push(a);
    matchupB.push(b);
  });
  const numMatchups = matchupA.length;

  const seedCounts: Uint32Array[] = Array.from(
    { length: numTeams },
    () => new Uint32Array(numTeams),
  );
  const playoffCounts = new Uint32Array(numTeams);
  const byeCounts = new Uint32Array(numTeams);

  const next = createRng(seed);
  const wins = new Float64Array(numTeams);
  const ties = new Float64Array(numTeams);
  const pointsFor = new Float64Array(numTeams);
  const order = Array.from({ length: numTeams }, (_, i) => i);

  for (let it = 0; it < iterations; it++) {
    wins.set(startWins);
    ties.set(startTies);
    pointsFor.set(startPointsFor);

    for (let m = 0; m < numMatchups; m++) {
      const a = matchupA[m] as number;
      const b = matchupB[m] as number;
      const scoreA = sampleTruncatedNormalAtZero(
        next,
        meanWeeklyScore[a] as number,
        sd[a] as number,
      );
      const scoreB = sampleTruncatedNormalAtZero(
        next,
        meanWeeklyScore[b] as number,
        sd[b] as number,
      );
      pointsFor[a] = (pointsFor[a] as number) + scoreA;
      pointsFor[b] = (pointsFor[b] as number) + scoreB;
      if (scoreA > scoreB) {
        wins[a] = (wins[a] as number) + 1;
      } else if (scoreB > scoreA) {
        wins[b] = (wins[b] as number) + 1;
      } else {
        ties[a] = (ties[a] as number) + 1;
        ties[b] = (ties[b] as number) + 1;
      }
    }

    for (let i = 0; i < numTeams; i++) {
      order[i] = i;
    }
    order.sort((x, y) =>
      compareStandings(
        {
          rosterId: rosterIds[x] as number,
          wins: wins[x] as number,
          ties: ties[x] as number,
          pointsFor: pointsFor[x] as number,
        },
        {
          rosterId: rosterIds[y] as number,
          wins: wins[y] as number,
          ties: ties[y] as number,
          pointsFor: pointsFor[y] as number,
        },
      ),
    );

    for (let rank = 0; rank < numTeams; rank++) {
      const teamIndex = order[rank] as number;
      const seedNum = rank + 1;
      (seedCounts[teamIndex] as Uint32Array)[seedNum - 1] =
        ((seedCounts[teamIndex] as Uint32Array)[seedNum - 1] as number) + 1;
      if (seedNum <= playoffTeams) {
        playoffCounts[teamIndex] = (playoffCounts[teamIndex] as number) + 1;
      }
      if (firstRoundByeCount > 0 && seedNum <= firstRoundByeCount) {
        byeCounts[teamIndex] = (byeCounts[teamIndex] as number) + 1;
      }
    }
  }

  const results: PlayoffOddsTeamResult[] = teams.map((t, i) => {
    const counts = seedCounts[i] as Uint32Array;
    const seedDistribution = new Map<number, number>();
    for (let s = 1; s <= numTeams; s++) {
      seedDistribution.set(s, (counts[s - 1] as number) / iterations);
    }
    return {
      rosterId: t.rosterId,
      playoffPct: (playoffCounts[i] as number) / iterations,
      byePct: firstRoundByeCount > 0 ? (byeCounts[i] as number) / iterations : null,
      seedDistribution,
    };
  });

  return { teams: results, reasons: [] };
}
