import { describe, expect, it } from "vitest";
import { LINEUP_MATERIALITY_FLOOR_PTS, hasMaterialSwaps } from "./lineup-recommendation";

describe("hasMaterialSwaps", () => {
  it("is false with no swaps regardless of delta", () => {
    expect(hasMaterialSwaps(0, 0)).toBe(false);
    expect(hasMaterialSwaps(3.4, 0)).toBe(false);
  });

  it("is false just below the floor even with swaps present", () => {
    expect(hasMaterialSwaps(0, 3)).toBe(false);
    expect(hasMaterialSwaps(LINEUP_MATERIALITY_FLOOR_PTS - 0.01, 3)).toBe(false);
  });

  it("is true at exactly the floor", () => {
    expect(hasMaterialSwaps(LINEUP_MATERIALITY_FLOOR_PTS, 1)).toBe(true);
  });

  it("is true just above the floor", () => {
    expect(hasMaterialSwaps(LINEUP_MATERIALITY_FLOOR_PTS + 0.01, 2)).toBe(true);
    expect(hasMaterialSwaps(3.4, 2)).toBe(true);
  });
});
