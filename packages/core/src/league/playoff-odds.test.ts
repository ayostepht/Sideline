import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYOFF_ODDS_ITERATIONS,
  simulatePlayoffOdds,
  type PlayoffOddsMatchup,
  type PlayoffOddsTeamInput,
} from "./playoff-odds.js";

/** Sum a team's seedDistribution map values. */
function sumMap(map: Map<number, number>): number {
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}

/**
 * Double round-robin schedule for 4 teams (D, A, B, C) over 6 weeks: each pair plays exactly
 * twice. Used by several tests below as a representative "many remaining games" scenario.
 *   Week 1: D-A, B-C   Week 2: D-B, A-C   Week 3: D-C, A-B
 *   Week 4: D-A, B-C   Week 5: D-B, A-C   Week 6: D-C, A-B
 */
function doubleRoundRobinSchedule(): PlayoffOddsMatchup[] {
  const pairs: [string, string][] = [
    ["D", "A"],
    ["B", "C"],
    ["D", "B"],
    ["A", "C"],
    ["D", "C"],
    ["A", "B"],
  ];
  const rosterIdOf: Record<string, number> = { D: 1, A: 2, B: 3, C: 4 };
  const schedule: PlayoffOddsMatchup[] = [];
  for (let rep = 0; rep < 2; rep++) {
    pairs.forEach(([x, y], i) => {
      schedule.push({
        week: rep * 3 + Math.floor(i / 2) + 1,
        rosterIdA: rosterIdOf[x] as number,
        rosterIdB: rosterIdOf[y] as number,
      });
    });
  }
  return schedule;
}

function evenTeams(): PlayoffOddsTeamInput[] {
  return [
    { rosterId: 1, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 },
    { rosterId: 2, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 },
    { rosterId: 3, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 },
    { rosterId: 4, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 },
  ];
}

describe("simulatePlayoffOdds (LEAGUE-5)", () => {
  it("criterion 1: determinism -- same inputs and seed produce bit-identical output", () => {
    const input = {
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      seed: 42,
      iterations: 500,
    };
    const r1 = simulatePlayoffOdds(input);
    const r2 = simulatePlayoffOdds(input);

    expect(r1.teams.map((t) => t.playoffPct)).toEqual(r2.teams.map((t) => t.playoffPct));
    r1.teams.forEach((t, i) => {
      const other = r2.teams[i] as (typeof r1.teams)[number];
      expect(Array.from(t.seedDistribution.entries())).toEqual(
        Array.from(other.seedDistribution.entries()),
      );
    });
  });

  it("criterion 2: sum(playoffPct) across all teams equals playoffTeams exactly (within fp tolerance)", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      seed: 7,
      iterations: 2000,
    });
    const sum = result.teams.reduce((acc, t) => acc + t.playoffPct, 0);
    // Every iteration assigns exactly `playoffTeams` teams a top seed, so this sum is exact
    // arithmetic (integer counts / iterations), not a Monte Carlo approximation.
    expect(Math.abs(sum - 2)).toBeLessThan(0.005 * 2);
  });

  it("criterion 3: each team's seedDistribution sums to 1", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      seed: 99,
      iterations: 1000,
    });
    for (const team of result.teams) {
      expect(sumMap(team.seedDistribution)).toBeCloseTo(1, 10);
    }
  });

  it("criterion 4: zero remaining games -- playoffPct is deterministically 0 or 1 from the current record, seedDistribution puts 100% on the actual seed", () => {
    // Current standings: roster 1 (3-0), roster 2 (2-1), roster 3 (1-2), roster 4 (0-3).
    // playoffTeams: 2 -> rosters 1 and 2 are already in, 3 and 4 are already out.
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 3, ties: 0, pointsFor: 300, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 2, wins: 2, ties: 0, pointsFor: 280, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 3, wins: 1, ties: 0, pointsFor: 260, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 4, wins: 0, ties: 0, pointsFor: 240, meanWeeklyScore: 100, sd: 15 },
    ];
    const result = simulatePlayoffOdds({
      teams,
      schedule: [],
      playoffTeams: 2,
      seed: 1,
    });

    const byId = new Map(result.teams.map((t) => [t.rosterId, t]));
    expect(byId.get(1)?.playoffPct).toBe(1);
    expect(byId.get(2)?.playoffPct).toBe(1);
    expect(byId.get(3)?.playoffPct).toBe(0);
    expect(byId.get(4)?.playoffPct).toBe(0);

    // 100% of probability mass on the real current seed for each team.
    expect(byId.get(1)?.seedDistribution.get(1)).toBe(1);
    expect(byId.get(2)?.seedDistribution.get(2)).toBe(1);
    expect(byId.get(3)?.seedDistribution.get(3)).toBe(1);
    expect(byId.get(4)?.seedDistribution.get(4)).toBe(1);
    for (const team of result.teams) {
      expect(sumMap(team.seedDistribution)).toBe(1);
    }
    expect(result.reasons.map((r) => r.code)).toContain("LEAGUE_PLAYOFF_ODDS_NO_REMAINING_GAMES");
  });

  it("criterion 5: firstRoundByeCount defaults to 0, so every team's byePct is null", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      seed: 3,
      iterations: 200,
    });
    for (const team of result.teams) {
      expect(team.byePct).toBeNull();
    }
  });

  it("criterion 5b: firstRoundByeCount explicitly 0 also yields null byePct (zero-remaining-games path too)", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: [],
      playoffTeams: 2,
      firstRoundByeCount: 0,
      seed: 3,
    });
    for (const team of result.teams) {
      expect(team.byePct).toBeNull();
    }
  });

  it("criterion 6: firstRoundByeCount > 0 populates byePct, summing to firstRoundByeCount", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      firstRoundByeCount: 1,
      seed: 11,
      iterations: 2000,
    });
    const sum = result.teams.reduce((acc, t) => acc + (t.byePct as number), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.005);
    for (const team of result.teams) {
      expect(team.byePct).not.toBeNull();
    }
  });

  it("criterion 6b: firstRoundByeCount > 0 in the zero-remaining-games path", () => {
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 3, ties: 0, pointsFor: 300, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 2, wins: 2, ties: 0, pointsFor: 280, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 3, wins: 1, ties: 0, pointsFor: 260, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 4, wins: 0, ties: 0, pointsFor: 240, meanWeeklyScore: 100, sd: 15 },
    ];
    const result = simulatePlayoffOdds({
      teams,
      schedule: [],
      playoffTeams: 4,
      firstRoundByeCount: 1,
      seed: 1,
    });
    const byId = new Map(result.teams.map((t) => [t.rosterId, t]));
    expect(byId.get(1)?.byePct).toBe(1);
    expect(byId.get(2)?.byePct).toBe(0);
    expect(byId.get(3)?.byePct).toBe(0);
    expect(byId.get(4)?.byePct).toBe(0);
  });

  it("criterion 7: a dominant team (high mean, low sd) ends up with playoffPct close to 1 after enough remaining games", () => {
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 200, sd: 1 }, // D: dominant
      { rosterId: 2, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 }, // A
      { rosterId: 3, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 }, // B
      { rosterId: 4, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 20 }, // C
    ];
    const result = simulatePlayoffOdds({
      teams,
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      seed: 123,
      iterations: 2000,
    });
    const dominant = result.teams.find((t) => t.rosterId === 1);
    expect(dominant?.playoffPct).toBeGreaterThan(0.9);
    // Sanity: the dominant team overwhelmingly finishes seed 1, not just "top 2".
    expect(dominant?.seedDistribution.get(1)).toBeGreaterThan(0.8);
  });

  it("every team making the playoffs (playoffTeams === numTeams) yields playoffPct exactly 1 for all, regardless of schedule outcome", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 4,
      seed: 55,
      iterations: 300,
    });
    for (const team of result.teams) {
      expect(team.playoffPct).toBe(1);
    }
  });

  it("default iterations constant is 10000 and is used when `iterations` is omitted", () => {
    expect(DEFAULT_PLAYOFF_ODDS_ITERATIONS).toBe(10000);
    // Indirect check: a tiny schedule run with default iterations should still produce a valid,
    // fully-summing distribution (exercises the omitted-iterations branch).
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: [{ week: 1, rosterIdA: 1, rosterIdB: 2 }],
      playoffTeams: 2,
      seed: 5,
    });
    for (const team of result.teams) {
      expect(sumMap(team.seedDistribution)).toBeCloseTo(1, 10);
    }
  });

  it("a non-positive `iterations` input falls back to the default rather than dividing by zero", () => {
    const result = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: [{ week: 1, rosterIdA: 1, rosterIdB: 2 }],
      playoffTeams: 2,
      seed: 5,
      iterations: 0,
    });
    for (const team of result.teams) {
      expect(Number.isFinite(team.playoffPct)).toBe(true);
    }
  });

  it("throws a clear error when a schedule entry references a rosterId not present in teams", () => {
    expect(() =>
      simulatePlayoffOdds({
        teams: evenTeams(),
        schedule: [{ week: 1, rosterIdA: 1, rosterIdB: 999 }],
        playoffTeams: 2,
        seed: 1,
      }),
    ).toThrow(/rosterId not present in teams/);
  });

  it("throws when playoffTeams exceeds the number of teams (general Monte Carlo path, 4 teams)", () => {
    expect(() =>
      simulatePlayoffOdds({
        teams: evenTeams(),
        schedule: doubleRoundRobinSchedule(),
        playoffTeams: 10,
        seed: 1,
        iterations: 50,
      }),
    ).toThrow(/playoffTeams \(10\) must be between 0 and the number of teams \(4\)/);
  });

  it("throws when playoffTeams exceeds the number of teams (zero-remaining-games path, 2 teams) -- the Major finding's exact repro", () => {
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 1, ties: 0, pointsFor: 100, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 2, wins: 0, ties: 0, pointsFor: 90, meanWeeklyScore: 100, sd: 15 },
    ];
    expect(() =>
      simulatePlayoffOdds({
        teams,
        schedule: [],
        playoffTeams: 10,
        seed: 1,
      }),
    ).toThrow(/playoffTeams \(10\) must be between 0 and the number of teams \(2\)/);
  });

  it("throws when firstRoundByeCount exceeds the number of teams (general Monte Carlo path)", () => {
    expect(() =>
      simulatePlayoffOdds({
        teams: evenTeams(),
        schedule: doubleRoundRobinSchedule(),
        playoffTeams: 2,
        firstRoundByeCount: 10,
        seed: 1,
        iterations: 50,
      }),
    ).toThrow(/firstRoundByeCount \(10\) must be between 0 and the number of teams \(4\)/);
  });

  it("throws when firstRoundByeCount exceeds the number of teams (zero-remaining-games path)", () => {
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 1, ties: 0, pointsFor: 100, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 2, wins: 0, ties: 0, pointsFor: 90, meanWeeklyScore: 100, sd: 15 },
    ];
    expect(() =>
      simulatePlayoffOdds({
        teams,
        schedule: [],
        playoffTeams: 2,
        firstRoundByeCount: 10,
        seed: 1,
      }),
    ).toThrow(/firstRoundByeCount \(10\) must be between 0 and the number of teams \(2\)/);
  });

  it("does NOT reject firstRoundByeCount > playoffTeams (a valid combination) in either path", () => {
    // General Monte Carlo path: firstRoundByeCount (3) > playoffTeams (2), still <= numTeams (4).
    const monteCarlo = simulatePlayoffOdds({
      teams: evenTeams(),
      schedule: doubleRoundRobinSchedule(),
      playoffTeams: 2,
      firstRoundByeCount: 3,
      seed: 1,
      iterations: 500,
    });
    const mcSum = monteCarlo.teams.reduce((acc, t) => acc + (t.byePct as number), 0);
    expect(Math.abs(mcSum - 3)).toBeLessThan(0.01 * 3);

    // Zero-remaining-games path: same out-of-order but in-range combination.
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 3, ties: 0, pointsFor: 300, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 2, wins: 2, ties: 0, pointsFor: 280, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 3, wins: 1, ties: 0, pointsFor: 260, meanWeeklyScore: 100, sd: 15 },
      { rosterId: 4, wins: 0, ties: 0, pointsFor: 240, meanWeeklyScore: 100, sd: 15 },
    ];
    const noGames = simulatePlayoffOdds({
      teams,
      schedule: [],
      playoffTeams: 1,
      firstRoundByeCount: 3,
      seed: 1,
    });
    const sum = noGames.teams.reduce((acc, t) => acc + (t.byePct as number), 0);
    expect(sum).toBe(3);
  });

  it("exact-tie draws increment ties for both teams (two teams with zero sd produce identical, always-tied scores)", () => {
    const teams: PlayoffOddsTeamInput[] = [
      { rosterId: 1, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 0 },
      { rosterId: 2, wins: 0, ties: 0, pointsFor: 0, meanWeeklyScore: 100, sd: 0 },
    ];
    const result = simulatePlayoffOdds({
      teams,
      schedule: [{ week: 1, rosterIdA: 1, rosterIdB: 2 }],
      playoffTeams: 1,
      seed: 1,
      iterations: 10,
    });
    // Both teams always score exactly 100 (sd 0 -> deterministic), so every iteration ties:
    // both end the single week at 0 wins / 1 tie / 100 pointsFor, a dead-even tiebreak that
    // `compareStandings` breaks on rosterId asc, so roster 1 always wins the tiebreak seed.
    const byId = new Map(result.teams.map((t) => [t.rosterId, t]));
    expect(byId.get(1)?.playoffPct).toBe(1);
    expect(byId.get(2)?.playoffPct).toBe(0);
  });
});
