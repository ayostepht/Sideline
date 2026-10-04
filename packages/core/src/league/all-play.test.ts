import { describe, expect, it } from "vitest";
import { computeAllPlaySeason, computeAllPlayWeek } from "./all-play.js";

describe("computeAllPlayWeek (LEAGUE-1)", () => {
  it("4-team week ranked 1st/2nd/3rd/4th: top team is 3-0, bottom team is 0-3", () => {
    const results = computeAllPlayWeek([
      { rosterId: 1, points: 100 }, // 1st
      { rosterId: 2, points: 90 }, // 2nd
      { rosterId: 3, points: 80 }, // 3rd
      { rosterId: 4, points: 70 }, // 4th
    ]);

    const byId = new Map(results.map((r) => [r.rosterId, r]));
    expect(byId.get(1)).toMatchObject({ wins: 3, losses: 0, ties: 0, gamesPlayed: 3, winRate: 1 });
    expect(byId.get(2)).toMatchObject({ wins: 2, losses: 1, ties: 0, gamesPlayed: 3 });
    expect(byId.get(2)?.winRate).toBeCloseTo(2 / 3, 10);
    expect(byId.get(3)).toMatchObject({ wins: 1, losses: 2, ties: 0, gamesPlayed: 3 });
    expect(byId.get(3)?.winRate).toBeCloseTo(1 / 3, 10);
    expect(byId.get(4)).toMatchObject({ wins: 0, losses: 3, ties: 0, gamesPlayed: 3, winRate: 0 });
  });

  it("ties count as 0.5 wins in the win rate", () => {
    const results = computeAllPlayWeek([
      { rosterId: 1, points: 100 },
      { rosterId: 2, points: 100 },
      { rosterId: 3, points: 50 },
    ]);
    const team1 = results.find((r) => r.rosterId === 1);
    expect(team1).toMatchObject({ wins: 1, ties: 1, losses: 0, gamesPlayed: 2 });
    expect(team1?.winRate).toBeCloseTo((1 + 0.5 * 1) / 2, 10);
  });

  it("fewer than 2 teams scoring (bye-like edge case): gamesPlayed 0, winRate 0, NO_OPPONENTS reason", () => {
    const results = computeAllPlayWeek([{ rosterId: 1, points: 42 }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ wins: 0, losses: 0, ties: 0, gamesPlayed: 0, winRate: 0 });
    expect(results[0]?.reasons).toEqual([
      expect.objectContaining({ code: "LEAGUE_ALL_PLAY_NO_OPPONENTS" }),
    ]);
  });

  it("zero teams scoring returns an empty array", () => {
    expect(computeAllPlayWeek([])).toEqual([]);
  });
});

describe("computeAllPlaySeason (LEAGUE-1)", () => {
  it("sums wins/losses/ties and games played across multiple weeks", () => {
    const results = computeAllPlaySeason([
      {
        week: 1,
        scores: [
          { rosterId: 1, points: 100 },
          { rosterId: 2, points: 90 },
          { rosterId: 3, points: 80 },
        ],
      },
      {
        week: 2,
        scores: [
          { rosterId: 1, points: 70 },
          { rosterId: 2, points: 90 },
          { rosterId: 3, points: 80 },
        ],
      },
    ]);

    const team1 = results.find((r) => r.rosterId === 1);
    // Week 1: 2-0. Week 2 (last place): 0-2. Season: 2-2, 4 games.
    expect(team1).toMatchObject({ wins: 2, losses: 2, ties: 0, gamesPlayed: 4 });
    expect(team1?.winRate).toBeCloseTo(0.5, 10);
    expect(team1?.weeklyWinRates).toEqual([1, 0]);
  });

  it("sorts weeks ascending before building weeklyWinRates, regardless of input order", () => {
    const results = computeAllPlaySeason([
      {
        week: 2,
        scores: [
          { rosterId: 1, points: 50 },
          { rosterId: 2, points: 100 },
        ],
      },
      {
        week: 1,
        scores: [
          { rosterId: 1, points: 100 },
          { rosterId: 2, points: 50 },
        ],
      },
    ]);
    const team1 = results.find((r) => r.rosterId === 1);
    expect(team1?.weeklyWinRates).toEqual([1, 0]);
  });

  it("a team that never had an opponent all season gets NO_GAMES reason", () => {
    const results = computeAllPlaySeason([{ week: 1, scores: [{ rosterId: 1, points: 10 }] }]);
    expect(results[0]).toMatchObject({ gamesPlayed: 0, winRate: 0 });
    expect(results[0]?.reasons).toEqual([
      expect.objectContaining({ code: "LEAGUE_ALL_PLAY_NO_GAMES" }),
    ]);
  });

  it("no weeks at all returns an empty array", () => {
    expect(computeAllPlaySeason([])).toEqual([]);
  });
});
