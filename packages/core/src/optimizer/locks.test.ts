import { describe, expect, it } from "vitest";
import { isLocked } from "./locks.js";

describe("isLocked (LINEUP-3)", () => {
  it("is locked when now is at or after kickoff", () => {
    const now = new Date("2026-09-14T17:00:00.000Z");
    expect(
      isLocked({ kickoffUtc: "2026-09-14T17:00:00.000Z", kickoffApproximate: false }, now),
    ).toBe(true);
    expect(
      isLocked({ kickoffUtc: "2026-09-14T16:00:00.000Z", kickoffApproximate: true }, now),
    ).toBe(true);
  });

  it("is not locked when now is before kickoff", () => {
    const now = new Date("2026-09-14T16:59:59.000Z");
    expect(
      isLocked({ kickoffUtc: "2026-09-14T17:00:00.000Z", kickoffApproximate: false }, now),
    ).toBe(false);
  });

  it("defaults to not locked when kickoffUtc is unknown (null)", () => {
    const now = new Date("2026-09-14T20:00:00.000Z");
    expect(isLocked({ kickoffUtc: null, kickoffApproximate: false }, now)).toBe(false);
  });
});
