import { describe, expect, it } from "vitest";
import { isGameWindow } from "./windows.js";

const d = (s: string): Date => new Date(s);

describe("isGameWindow", () => {
  const games = [{ kickoffUtc: "2025-10-01T00:15:00Z" }, { kickoffUtc: null }];
  it("is true from kickoff to kickoff + 4h", () => {
    expect(isGameWindow(d("2025-10-01T00:14:59Z"), games)).toBe(false);
    expect(isGameWindow(d("2025-10-01T00:15:00Z"), games)).toBe(true);
    expect(isGameWindow(d("2025-10-01T04:14:59Z"), games)).toBe(true);
    expect(isGameWindow(d("2025-10-01T04:15:00Z"), games)).toBe(false);
  });
  it("handles a Wednesday game (no fallback when kickoffs exist)", () => {
    const wed = [{ kickoffUtc: "2025-10-15T18:00:00Z" }]; // Wednesday
    expect(isGameWindow(d("2025-10-15T19:00:00Z"), wed)).toBe(true);
    // Sunday 1pm ET would be in the fallback, but real kickoffs win.
    expect(isGameWindow(d("2025-10-19T17:30:00Z"), wed)).toBe(false);
  });
  it("uses the fallback when no kickoffs are known", () => {
    expect(isGameWindow(d("2025-10-19T17:30:00Z"), [])).toBe(true); // Sun 13:30 EDT
    expect(isGameWindow(d("2025-10-19T16:30:00Z"), [])).toBe(false); // Sun 12:30 EDT
    expect(isGameWindow(d("2025-10-17T00:30:00Z"), [{ kickoffUtc: null }])).toBe(true); // Thu 20:30 EDT
    expect(isGameWindow(d("2025-10-21T00:30:00Z"), [])).toBe(true); // Mon 20:30 EDT
    expect(isGameWindow(d("2025-10-22T17:30:00Z"), [])).toBe(false); // Wed
  });
  it("fallback is DST-safe", () => {
    // Sun 2025-11-02 DST ends; 13:30 EST = 18:30Z, 13:30 EDT would be 17:30Z.
    expect(isGameWindow(d("2025-11-02T18:30:00Z"), [])).toBe(true);
    expect(isGameWindow(d("2025-11-02T17:30:00Z"), [])).toBe(false); // 12:30 EST
    // Sun 2025-03-09 DST starts; 13:30 EDT = 17:30Z.
    expect(isGameWindow(d("2025-03-09T17:30:00Z"), [])).toBe(true);
    expect(isGameWindow(d("2025-03-09T16:30:00Z"), [])).toBe(false);
  });
});
