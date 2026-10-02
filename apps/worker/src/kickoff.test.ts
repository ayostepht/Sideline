import { describe, expect, it } from "vitest";
import { fallbackKickoffUtc } from "./kickoff.js";

describe("ADR-002 fallback kickoff", () => {
  it("Sunday before DST ends is 13:00 EDT = 17:00Z", () => {
    expect(fallbackKickoffUtc("2026-09-13")).toBe("2026-09-13T17:00:00.000Z");
    expect(fallbackKickoffUtc("2026-11-01")).toBe("2026-11-01T18:00:00.000Z"); // DST ends that day, 13:00 is EST
  });
  it("Sunday after DST ends is 13:00 EST = 18:00Z", () => {
    expect(fallbackKickoffUtc("2026-11-08")).toBe("2026-11-08T18:00:00.000Z");
  });
  it("Thursday is 20:00 ET: 00:00Z next day in EDT, 01:00Z in EST", () => {
    expect(fallbackKickoffUtc("2026-10-15")).toBe("2026-10-16T00:00:00.000Z");
    expect(fallbackKickoffUtc("2026-11-12")).toBe("2026-11-13T01:00:00.000Z");
  });
  it("Saturday and Monday use 20:00 ET", () => {
    expect(fallbackKickoffUtc("2026-12-19")).toBe("2026-12-20T01:00:00.000Z");
    expect(fallbackKickoffUtc("2026-10-12")).toBe("2026-10-13T00:00:00.000Z");
  });
  it("rejects invalid dates", () => {
    expect(fallbackKickoffUtc("2026-02-31")).toBeNull();
    expect(fallbackKickoffUtc("not a date")).toBeNull();
  });
  it("pins the stored format: ISO 8601 UTC ending in .000Z", () => {
    for (const d of ["2026-09-13", "2026-11-08", "2026-10-15"]) {
      expect(fallbackKickoffUtc(d)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    }
  });
});
