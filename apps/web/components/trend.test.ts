import { describe, expect, it } from "vitest";
import { trendFromDelta, trendLabel } from "./trend";

describe("trend", () => {
  it("labels", () => {
    expect(trendLabel("rising")).toBe("Rising");
    expect(trendLabel("steady")).toBe("Steady");
    expect(trendLabel("falling")).toBe("Falling");
  });
  it("maps delta with threshold", () => {
    expect(trendFromDelta(2)).toBe("rising");
    expect(trendFromDelta(0.5)).toBe("steady");
    expect(trendFromDelta(-0.5)).toBe("steady");
    expect(trendFromDelta(-3)).toBe("falling");
    expect(trendFromDelta(1, 2)).toBe("steady");
  });
});
