import { describe, expect, it } from "vitest";
import { buildScoreRangeGeometry } from "./score-range-geometry";

describe("buildScoreRangeGeometry", () => {
  it("returns no bars for an empty team list", () => {
    expect(buildScoreRangeGeometry([], 100, 20)).toEqual({ bars: [], width: 100, height: 0 });
  });

  it("stacks rows by rowHeight and centers each y in its row", () => {
    const g = buildScoreRangeGeometry(
      [
        { p10: 80, p50: 90, p90: 100 },
        { p10: 70, p50: 85, p90: 95 },
      ],
      100,
      20,
    );
    expect(g.height).toBe(40);
    expect(g.bars.map((b) => b.y)).toEqual([10, 30]);
  });

  it("shares one x domain across every team so bars are comparable", () => {
    const g = buildScoreRangeGeometry(
      [
        { p10: 0, p50: 50, p90: 100 },
        { p10: 25, p50: 50, p90: 75 },
      ],
      100,
      20,
      0,
    );
    // Team A spans the full domain; team B's range sits inside it.
    expect(g.bars[0]).toMatchObject({ x10: 0, x90: 100 });
    expect(g.bars[1]).toMatchObject({ x10: 25, x90: 75 });
    expect(g.bars[0]?.x50).toBe(g.bars[1]?.x50);
  });

  it("centers a flat (zero-spread) range mid-width", () => {
    const g = buildScoreRangeGeometry([{ p10: 50, p50: 50, p90: 50 }], 100, 20, 0);
    expect(g.bars[0]).toMatchObject({ x10: 50, x50: 50, x90: 50 });
  });
});
