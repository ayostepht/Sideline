import { describe, expect, it } from "vitest";
import {
  POINTS_STEADY_BAND_MIN,
  POINTS_STEADY_BAND_PCT,
  USAGE_STEADY_BAND,
  computeTrendSignal,
} from "./signal.js";

describe("computeTrendSignal (TREND-4)", () => {
  it("exports the documented threshold constants", () => {
    expect(POINTS_STEADY_BAND_PCT).toBe(0.15);
    expect(POINTS_STEADY_BAND_MIN).toBe(2);
    expect(USAGE_STEADY_BAND).toBe(0.03);
  });

  // seasonPpg = 20 => pointsBand = max(20*0.15, 2) = 3

  it("usageDelta null: falls back to the points signal alone (Rising)", () => {
    const result = computeTrendSignal({ l3Delta: 5, usageDelta: null, seasonPpg: 20 });
    expect(result.signal).toBe("Rising");
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "TREND_SIGNAL_POINTS_DELTA", impact: 5 }),
      expect.objectContaining({ code: "TREND_SIGNAL_NO_USAGE_DATA" }),
    ]);
  });

  it("usageDelta null, l3Delta within the steady band: Steady", () => {
    const result = computeTrendSignal({ l3Delta: 1, usageDelta: null, seasonPpg: 20 });
    expect(result.signal).toBe("Steady");
  });

  it("usageDelta null, l3Delta below -band: Falling", () => {
    const result = computeTrendSignal({ l3Delta: -5, usageDelta: null, seasonPpg: 20 });
    expect(result.signal).toBe("Falling");
  });

  it("very low seasonPpg uses the 2-point floor band instead of a near-zero band", () => {
    // seasonPpg = 0 => band = max(0, 2) = 2
    expect(computeTrendSignal({ l3Delta: 1, usageDelta: null, seasonPpg: 0 }).signal).toBe(
      "Steady",
    );
    expect(computeTrendSignal({ l3Delta: 3, usageDelta: null, seasonPpg: 0 }).signal).toBe(
      "Rising",
    );
  });

  it("points and usage signals agree (both Rising): result Rising, no conflict reason", () => {
    const result = computeTrendSignal({ l3Delta: 5, usageDelta: 0.05, seasonPpg: 20 });
    expect(result.signal).toBe("Rising");
    expect(result.reasons.some((r) => r.code === "TREND_SIGNAL_CONFLICTING")).toBe(false);
  });

  it("points Steady, usage Rising: usage signal wins", () => {
    const result = computeTrendSignal({ l3Delta: 1, usageDelta: 0.05, seasonPpg: 20 });
    expect(result.signal).toBe("Rising");
  });

  it("points Rising, usage Steady: points signal wins", () => {
    const result = computeTrendSignal({ l3Delta: 5, usageDelta: 0.01, seasonPpg: 20 });
    expect(result.signal).toBe("Rising");
  });

  it("points Rising, usage Falling: conflicting signals resolve to Steady with a reason", () => {
    const result = computeTrendSignal({ l3Delta: 5, usageDelta: -0.05, seasonPpg: 20 });
    expect(result.signal).toBe("Steady");
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "TREND_SIGNAL_CONFLICTING" })]),
    );
  });

  it("both Steady: result Steady", () => {
    const result = computeTrendSignal({ l3Delta: 0, usageDelta: 0, seasonPpg: 20 });
    expect(result.signal).toBe("Steady");
  });

  it("always includes the raw usage delta value in reasons when usage data exists", () => {
    const result = computeTrendSignal({ l3Delta: 5, usageDelta: 0.05, seasonPpg: 20 });
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TREND_SIGNAL_USAGE_DELTA", value: 0.05 }),
      ]),
    );
  });
});
