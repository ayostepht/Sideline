import { describe, expect, it } from "vitest";
import { computePositionalHeatmap } from "./positional-heatmap.js";

describe("computePositionalHeatmap (LEAGUE-4)", () => {
  it("a team exactly at the league median has delta 0 and ratio 1", () => {
    const results = computePositionalHeatmap([
      { rosterId: 1, position: "RB", value: 100 },
      { rosterId: 2, position: "RB", value: 150 }, // median
      { rosterId: 3, position: "RB", value: 200 },
    ]);
    const median150 = results.find((r) => r.rosterId === 2);
    expect(median150).toMatchObject({ median: 150, delta: 0, ratio: 1 });
  });

  it("a team well above median shows a clearly positive delta and ratio above 1", () => {
    const results = computePositionalHeatmap([
      { rosterId: 1, position: "WR", value: 100 },
      { rosterId: 2, position: "WR", value: 110 },
      { rosterId: 3, position: "WR", value: 300 },
    ]);
    const top = results.find((r) => r.rosterId === 3);
    expect(top?.median).toBe(110);
    expect(top?.delta).toBeCloseTo(190, 10);
    expect(top?.ratio).toBeCloseTo(300 / 110, 10);
    expect(top?.delta ?? 0).toBeGreaterThan(0);
    expect(top?.ratio ?? 0).toBeGreaterThan(1);
  });

  it("even number of teams: median is the average of the two middle values", () => {
    const results = computePositionalHeatmap([
      { rosterId: 1, position: "QB", value: 100 },
      { rosterId: 2, position: "QB", value: 200 },
      { rosterId: 3, position: "QB", value: 300 },
      { rosterId: 4, position: "QB", value: 400 },
    ]);
    // sorted: 100, 200, 300, 400 -> median = (200+300)/2 = 250
    expect(results[0]?.median).toBe(250);
  });

  it("every position present in the input gets its own independent median", () => {
    const results = computePositionalHeatmap([
      { rosterId: 1, position: "QB", value: 300 },
      { rosterId: 2, position: "QB", value: 100 },
      { rosterId: 1, position: "TE", value: 50 },
      { rosterId: 2, position: "TE", value: 30 },
    ]);
    const qb = results.filter((r) => r.position === "QB");
    const te = results.filter((r) => r.position === "TE");
    expect(qb.every((r) => r.median === 200)).toBe(true);
    expect(te.every((r) => r.median === 40)).toBe(true);
  });

  it("a zero league median produces a null ratio with a ZERO_MEDIAN reason, delta still 0", () => {
    const results = computePositionalHeatmap([
      { rosterId: 1, position: "K", value: 0 },
      { rosterId: 2, position: "K", value: 0 },
    ]);
    expect(results[0]?.median).toBe(0);
    expect(results[0]?.delta).toBe(0);
    expect(results[0]?.ratio).toBeNull();
    expect(results[0]?.reasons).toEqual([
      expect.objectContaining({ code: "LEAGUE_HEATMAP_ZERO_MEDIAN" }),
    ]);
  });

  it("single-team league: median equals the lone value, delta 0, ratio 1", () => {
    const results = computePositionalHeatmap([{ rosterId: 1, position: "DEF", value: 85 }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ median: 85, delta: 0, ratio: 1 });
  });

  it("empty input returns an empty array", () => {
    expect(computePositionalHeatmap([])).toEqual([]);
  });
});
