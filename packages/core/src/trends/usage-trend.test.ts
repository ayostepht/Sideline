import { describe, expect, it } from "vitest";
import type { UsageWeek } from "@sideline/shared";
import { POSITION_USAGE_FIELDS, computeUsageTrend } from "./usage-trend.js";

function usageWeek(week: number, overrides: Partial<UsageWeek> = {}): UsageWeek {
  return {
    season: 2025,
    week,
    playerId: "p1",
    team: "KC",
    snapPct: null,
    targets: null,
    targetShare: null,
    airYardsShare: null,
    carries: null,
    carryShare: null,
    rzTouches: null,
    ...overrides,
  };
}

describe("computeUsageTrend (TREND-2)", () => {
  it("position-to-fields mapping: QB gets snapPct and rzTouches only", () => {
    expect(POSITION_USAGE_FIELDS.QB).toEqual(["snapPct", "rzTouches"]);
  });

  it("position-to-fields mapping: RB gets snapPct, carryShare, targetShare, rzTouches", () => {
    expect(POSITION_USAGE_FIELDS.RB).toEqual(["snapPct", "carryShare", "targetShare", "rzTouches"]);
  });

  it("position-to-fields mapping: WR gets snapPct, targetShare, airYardsShare, rzTouches (no carryShare)", () => {
    expect(POSITION_USAGE_FIELDS.WR).toEqual([
      "snapPct",
      "targetShare",
      "airYardsShare",
      "rzTouches",
    ]);
  });

  it("position-to-fields mapping: TE matches WR's field set", () => {
    expect(POSITION_USAGE_FIELDS.TE).toEqual(POSITION_USAGE_FIELDS.WR);
  });

  it("K and DEF (and any unrecognized position) have no tracked usage fields", () => {
    const kResult = computeUsageTrend({ position: "K", weeks: [usageWeek(1)] });
    expect(kResult.fields).toEqual([]);
    expect(kResult.reasons).toEqual([
      expect.objectContaining({ code: "TREND_USAGE_NOT_POSITION_RELEVANT", value: "K" }),
    ]);

    const defResult = computeUsageTrend({ position: "DEF", weeks: [] });
    expect(defResult.fields).toEqual([]);

    const unknownResult = computeUsageTrend({ position: "LS", weeks: [] });
    expect(unknownResult.fields).toEqual([]);
  });

  it("computes L3 versus prior-weeks delta for a WR across 5 weeks", () => {
    // targetShare: weeks 1,2 = prior (0.10, 0.20) avg 0.15; weeks 3,4,5 = L3 (0.30,0.30,0.30) avg 0.30
    // delta = 0.30 - 0.15 = 0.15
    const weeks = [1, 2, 3, 4, 5].map((week) =>
      usageWeek(week, {
        targetShare: week <= 2 ? (week === 1 ? 0.1 : 0.2) : 0.3,
        snapPct: 0.9,
        airYardsShare: 0.2,
        rzTouches: 1,
      }),
    );
    const result = computeUsageTrend({ position: "WR", weeks });
    const targetShareField = result.fields.find((f) => f.field === "targetShare");
    expect(targetShareField?.priorValue).toBeCloseTo(0.15, 10);
    expect(targetShareField?.l3Value).toBeCloseTo(0.3, 10);
    expect(targetShareField?.delta).toBeCloseTo(0.15, 10);
    expect(result.reasons).toEqual([]);
  });

  it("fewer than 3 weeks produces a small-sample reason and a no-prior-weeks reason when n=1", () => {
    const result = computeUsageTrend({
      position: "RB",
      weeks: [usageWeek(1, { carryShare: 0.5 })],
    });
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_USAGE_SMALL_SAMPLE", value: 1 }),
      expect.objectContaining({ code: "TREND_USAGE_NO_PRIOR_WEEKS", value: 0 }),
    ]);
    const carryShareField = result.fields.find((f) => f.field === "carryShare");
    expect(carryShareField?.l3Value).toBeCloseTo(0.5, 10);
    expect(carryShareField?.priorValue).toBeNull();
    expect(carryShareField?.delta).toBeNull();
  });

  it("ignores null values when averaging within a window", () => {
    // RB snapPct: week1 = null (DNP stat missing), week2 = 0.8, week3 = 0.6 (all L3 since n=3)
    const weeks = [
      usageWeek(1, { snapPct: null }),
      usageWeek(2, { snapPct: 0.8 }),
      usageWeek(3, { snapPct: 0.6 }),
    ];
    const result = computeUsageTrend({ position: "RB", weeks });
    const snapPctField = result.fields.find((f) => f.field === "snapPct");
    expect(snapPctField?.l3Value).toBeCloseTo(0.7, 10);
  });
});
