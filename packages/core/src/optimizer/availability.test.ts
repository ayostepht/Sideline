import { describe, expect, it } from "vitest";
import { AVAILABILITY_MULTIPLIERS, applyAvailability } from "./availability.js";

describe("applyAvailability (LINEUP-4)", () => {
  it("zeroes value on bye", () => {
    const result = applyAvailability({ status: null, isBye: true, rawValue: 12 });
    expect(result.value).toBe(0);
    expect(result.reasons).toEqual([
      { code: "UNAVAILABLE", label: "On bye this week", impact: -12, projectedPoints: 12 },
    ]);
  });

  it("zeroes value when status is Out", () => {
    const result = applyAvailability({ status: "Out", isBye: false, rawValue: 10 });
    expect(result.value).toBe(0);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("UNAVAILABLE");
    expect(result.reasons[0]?.impact).toBe(-10);
  });

  it("zeroes value when status is IR", () => {
    const result = applyAvailability({ status: "IR", isBye: false, rawValue: 8 });
    expect(result.value).toBe(0);
    expect(result.reasons[0]?.code).toBe("UNAVAILABLE");
  });

  it("zeroes value when status is Suspended", () => {
    const result = applyAvailability({ status: "Suspended", isBye: false, rawValue: 5 });
    expect(result.value).toBe(0);
    expect(result.reasons[0]?.code).toBe("UNAVAILABLE");
  });

  it("discounts value by the doubtful multiplier", () => {
    const result = applyAvailability({ status: "Doubtful", isBye: false, rawValue: 20 });
    expect(result.value).toBeCloseTo(20 * AVAILABILITY_MULTIPLIERS.doubtful, 9);
    expect(result.reasons).toEqual([
      {
        code: "DOUBTFUL_DISCOUNT",
        label: "Doubtful, so we lowered their projection",
        value: AVAILABILITY_MULTIPLIERS.doubtful,
        impact: 20 * AVAILABILITY_MULTIPLIERS.doubtful - 20,
        projectedPoints: 20,
      },
    ]);
  });

  it("discounts value by the questionable multiplier", () => {
    const result = applyAvailability({ status: "Questionable", isBye: false, rawValue: 20 });
    expect(result.value).toBeCloseTo(20 * AVAILABILITY_MULTIPLIERS.questionable, 9);
    expect(result.reasons).toEqual([
      {
        code: "QUESTIONABLE_DISCOUNT",
        label: "Questionable, so we lowered their projection slightly",
        value: AVAILABILITY_MULTIPLIERS.questionable,
        impact: 20 * AVAILABILITY_MULTIPLIERS.questionable - 20,
        projectedPoints: 20,
      },
    ]);
  });

  it("passes value through unchanged for a healthy player", () => {
    const result = applyAvailability({ status: null, isBye: false, rawValue: 15.5 });
    expect(result.value).toBe(15.5);
    expect(result.reasons).toEqual([]);
  });
});
