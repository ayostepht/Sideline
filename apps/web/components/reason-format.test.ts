import { describe, expect, it } from "vitest";
import { formatImpact, formatProjectedPoints } from "./reason-format";

describe("formatImpact", () => {
  it("formats signs", () => {
    expect(formatImpact(1.234)).toMatchObject({ sign: "up", text: "+1.2 pts" });
    expect(formatImpact(-0.8)).toMatchObject({ sign: "down", text: "-0.8 pts" });
  });
  it("treats missing, tiny and non-finite as none", () => {
    expect(formatImpact(undefined).sign).toBe("none");
    expect(formatImpact(0.01).sign).toBe("none");
    expect(formatImpact(Number.NaN).sign).toBe("none");
  });
});

describe("formatProjectedPoints", () => {
  it("formats a typical value to one decimal", () => {
    expect(formatProjectedPoints(18.42)).toBe("18.4 proj pts");
  });
  it("formats zero", () => {
    expect(formatProjectedPoints(0)).toBe("0.0 proj pts");
  });
  it("rounds to one decimal", () => {
    expect(formatProjectedPoints(9.96)).toBe("10.0 proj pts");
  });
  it("returns undefined when missing or non-finite", () => {
    expect(formatProjectedPoints(undefined)).toBeUndefined();
    expect(formatProjectedPoints(Number.NaN)).toBeUndefined();
  });
});
