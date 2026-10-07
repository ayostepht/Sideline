import { describe, expect, it } from "vitest";
import { formatCount } from "./format-count";

describe("formatCount", () => {
  it("adds thousands separators and drops decimals", () => {
    expect(formatCount(59800)).toBe("59,800");
    expect(formatCount(59800.0)).toBe("59,800");
    expect(formatCount(12)).toBe("12");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(-1234)).toBe("-1,234");
  });
  it("handles non-finite values", () => {
    expect(formatCount(Number.NaN)).toBe("–");
  });
});
