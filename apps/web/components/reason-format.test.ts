import { describe, expect, it } from "vitest";
import { formatImpact } from "./reason-format";

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
