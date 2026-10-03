import { describe, expect, it } from "vitest";
import { formatImpact, formatProjectedPoints, formatReasonValue } from "./reason-format";

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

describe("formatReasonValue", () => {
  it("rounds a raw float to one decimal", () => {
    expect(formatReasonValue(94.5945945945946)).toBe("94.6");
    expect(formatReasonValue(89.1891891891892)).toBe("89.2");
  });
  it("passes a string through unchanged", () => {
    expect(formatReasonValue("WR")).toBe("WR");
    expect(formatReasonValue("4046692")).toBe("4046692");
  });
  it("leaves undefined as undefined", () => {
    expect(formatReasonValue(undefined)).toBeUndefined();
  });
  it("formats ROS_ESTIMATED_FROM_PPG as a week count, never a decimal", () => {
    expect(formatReasonValue(2, "ROS_ESTIMATED_FROM_PPG")).toBe("2 weeks");
    expect(formatReasonValue(1, "ROS_ESTIMATED_FROM_PPG")).toBe("1 week");
    expect(formatReasonValue(0, "ROS_ESTIMATED_FROM_PPG")).toBe("0 weeks");
  });
  it("leaves other reason codes' numeric formatting unchanged", () => {
    expect(formatReasonValue(94.5945945945946, "SOME_OTHER_CODE")).toBe("94.6");
    expect(formatReasonValue(94.5945945945946)).toBe("94.6");
  });
});
