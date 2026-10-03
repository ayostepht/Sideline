import { describe, expect, it } from "vitest";
import { ReasonSchema } from "./index.js";

describe("ReasonSchema", () => {
  it("parses a reason without projectedPoints (bye-week / roster-construction style reason)", () => {
    const reason = { code: "UNAVAILABLE", label: "On bye this week", impact: -12.3 };
    expect(ReasonSchema.parse(reason)).toEqual(reason);
  });

  it("parses a reason with projectedPoints set", () => {
    const reason = {
      code: "PROJECTION",
      label: "Projected for 18.4 points this week",
      value: 18.4,
      impact: 2.1,
      projectedPoints: 18.4,
    };
    expect(ReasonSchema.parse(reason)).toEqual(reason);
  });

  it("rejects unknown keys (strictness preserved)", () => {
    const reason = { code: "X", label: "Y", notARealField: 1 };
    expect(ReasonSchema.safeParse(reason).success).toBe(false);
  });
});
