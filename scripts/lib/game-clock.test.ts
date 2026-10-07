import { describe, expect, it } from "vitest";
import { DEFAULT_SCREENS_GAME_CLOCK, resolveScreensGameClock } from "./game-clock.js";

describe("resolveScreensGameClock", () => {
  it("defaults to the e2e fixture time", () => {
    expect(resolveScreensGameClock({})).toBe(DEFAULT_SCREENS_GAME_CLOCK);
    expect(DEFAULT_SCREENS_GAME_CLOCK).toBe("2026-10-02T12:00:00.000Z");
  });
  it("accepts an override", () => {
    expect(resolveScreensGameClock({ SCREENS_GAME_CLOCK: "2026-11-01T00:00:00Z" })).toBe(
      "2026-11-01T00:00:00Z",
    );
  });
  it("rejects a non-ISO override", () => {
    expect(() => resolveScreensGameClock({ SCREENS_GAME_CLOCK: "tomorrow" })).toThrow();
  });
});
