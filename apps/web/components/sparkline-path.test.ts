import { describe, expect, it } from "vitest";
import { buildSparkline } from "./sparkline-path";

describe("buildSparkline", () => {
  it("handles empty and all-null input", () => {
    expect(buildSparkline([], 100, 20)).toEqual({ path: "", points: [], referenceY: null });
    expect(buildSparkline([null, null], 100, 20).path).toBe("");
  });
  it("centers a single point", () => {
    const g = buildSparkline([5], 100, 20);
    expect(g.points).toHaveLength(1);
    expect(g.points[0]).toMatchObject({ x: 50, y: 10 });
    expect(g.path).toBe("M50 10");
  });
  it("draws a line, higher values higher on screen", () => {
    const g = buildSparkline([0, 10], 100, 24, undefined, 2);
    expect(g.path).toBe("M2 22L98 2");
  });
  it("breaks the line at nulls", () => {
    const g = buildSparkline([1, null, 3, 4], 100, 20);
    expect(g.path.match(/M/g)).toHaveLength(2);
    expect(g.points.map((p) => p.index)).toEqual([0, 2, 3]);
  });
  it("draws a flat line mid-height when all values are equal", () => {
    const g = buildSparkline([3, 3, 3], 100, 20);
    expect(g.points.every((p) => p.y === 10)).toBe(true);
  });
  it("keeps a flat series as a centered line", () => {
    const g = buildSparkline([3, 3], 96, 32);
    expect(g.path).toBe("M2 16L94 16");
  });
  it("includes the reference in the domain", () => {
    const g = buildSparkline([5, 6], 100, 22, 10, 2);
    expect(g.referenceY).toBe(2);
    expect(g.points[0]?.y).toBe(20);
  });
});
