import { describe, expect, it } from "vitest";
import { tradeFairness } from "./fairness.js";

describe("tradeFairness (TRADE-4)", () => {
  it("equal positive gains are fair", () => expect(tradeFairness(5, 5)).toBe("fair"));
  it("ratio exactly 0.75 is fair (either side larger)", () => {
    expect(tradeFairness(7.5, 10)).toBe("fair");
    expect(tradeFairness(10, 7.5)).toBe("fair");
  });
  it("ratio just under 0.75 leans toward the larger gainer", () => {
    expect(tradeFairness(10, 7.4)).toBe("leans_you");
    expect(tradeFairness(7.4, 10)).toBe("leans_them");
  });
  it("ratio exactly 0.4 leans; just under is lopsided", () => {
    expect(tradeFairness(4, 10)).toBe("leans_them");
    expect(tradeFairness(10, 4)).toBe("leans_you");
    expect(tradeFairness(3.9, 10)).toBe("lopsided");
  });
  it("one negative, both negative and zero gains are lopsided", () => {
    expect(tradeFairness(-1, 5)).toBe("lopsided");
    expect(tradeFairness(5, -1)).toBe("lopsided");
    expect(tradeFairness(-2, -3)).toBe("lopsided");
    expect(tradeFairness(0, 5)).toBe("lopsided");
    expect(tradeFairness(0, 0)).toBe("lopsided");
    expect(tradeFairness(Number.NaN, 5)).toBe("lopsided");
  });
});
