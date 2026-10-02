import { describe, expect, it } from "vitest";
import { waitMinutes } from "./sync-now-button";

describe("waitMinutes", () => {
  it("rounds up and is at least 1", () => {
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(60)).toBe(1);
    expect(waitMinutes(61)).toBe(2);
    expect(waitMinutes(300)).toBe(5);
  });
});
