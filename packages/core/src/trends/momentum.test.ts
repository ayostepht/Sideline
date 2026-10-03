import { describe, expect, it } from "vitest";
import type { TrendingEntry } from "@sideline/shared";
import {
  MOMENTUM_COLD_THRESHOLD,
  MOMENTUM_HOT_THRESHOLD,
  MOMENTUM_WARM_THRESHOLD,
  computeTrendingMomentum,
} from "./momentum.js";

function entry(type: "add" | "drop", count: number, lookbackHours = 24): TrendingEntry {
  return { playerId: "p1", type, count, lookbackHours, fetchedAt: "2026-10-03T00:00:00Z" };
}

describe("computeTrendingMomentum (TREND-5)", () => {
  it("no entries at all: zero counts, Neutral, NO_DATA reason", () => {
    const result = computeTrendingMomentum({ entries: [] });
    expect(result.addCount).toBe(0);
    expect(result.dropCount).toBe(0);
    expect(result.netCount).toBe(0);
    expect(result.label).toBe("Neutral");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "TREND_MOMENTUM_NO_DATA" })]),
    );
  });

  it("zero adds and zero drops (entries present with 0 counts): Neutral, no NO_DATA reason", () => {
    const result = computeTrendingMomentum({ entries: [entry("add", 0), entry("drop", 0)] });
    expect(result.netCount).toBe(0);
    expect(result.label).toBe("Neutral");
    expect(result.reasons.some((r) => r.code === "TREND_MOMENTUM_NO_DATA")).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TREND_MOMENTUM_ADDS", value: 0 }),
        expect.objectContaining({ code: "TREND_MOMENTUM_DROPS", value: 0 }),
      ]),
    );
  });

  it("add-heavy: net >= HOT threshold produces Hot", () => {
    const result = computeTrendingMomentum({ entries: [entry("add", 2000), entry("drop", 100)] });
    expect(result.addCount).toBe(2000);
    expect(result.dropCount).toBe(100);
    expect(result.netCount).toBe(1900);
    expect(result.label).toBe("Hot");
    expect(MOMENTUM_HOT_THRESHOLD).toBe(1000);
  });

  it("moderately add-heavy: net in the Warm band", () => {
    const result = computeTrendingMomentum({ entries: [entry("add", 200), entry("drop", 50)] });
    expect(result.netCount).toBe(150);
    expect(result.label).toBe("Warm");
    expect(MOMENTUM_WARM_THRESHOLD).toBe(100);
  });

  it("drop-heavy: net <= COLD threshold produces Cold", () => {
    const result = computeTrendingMomentum({ entries: [entry("add", 50), entry("drop", 500)] });
    expect(result.netCount).toBe(-450);
    expect(result.label).toBe("Cold");
    expect(MOMENTUM_COLD_THRESHOLD).toBe(-100);
  });

  it("small net difference stays Neutral", () => {
    const result = computeTrendingMomentum({ entries: [entry("add", 50), entry("drop", 40)] });
    expect(result.netCount).toBe(10);
    expect(result.label).toBe("Neutral");
  });

  it("sums counts across multiple entries of the same type (e.g. multiple lookback windows)", () => {
    const result = computeTrendingMomentum({
      entries: [entry("add", 100, 24), entry("add", 50, 168), entry("drop", 20, 24)],
    });
    expect(result.addCount).toBe(150);
    expect(result.dropCount).toBe(20);
    expect(result.netCount).toBe(130);
  });
});
