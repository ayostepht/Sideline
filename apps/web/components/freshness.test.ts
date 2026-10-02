import { describe, expect, it } from "vitest";
import { formatAge } from "./freshness";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe("formatAge", () => {
  it("handles never and invalid", () => {
    expect(formatAge(null, NOW)).toBe("Never updated");
    expect(formatAge("nope", NOW)).toBe("Never updated");
  });
  it("just now under a minute, including future timestamps", () => {
    expect(formatAge(ago(0), NOW)).toBe("just now");
    expect(formatAge(ago(59_999), NOW)).toBe("just now");
    expect(formatAge(ago(-5 * MIN), NOW)).toBe("just now");
  });
  it("minutes", () => {
    expect(formatAge(ago(MIN), NOW)).toBe("1 min ago");
    expect(formatAge(ago(59 * MIN), NOW)).toBe("59 min ago");
  });
  it("hours", () => {
    expect(formatAge(ago(60 * MIN), new Date(NOW))).toBe("1 h ago");
    expect(formatAge(ago(23 * 60 * MIN + 59 * MIN), NOW)).toBe("23 h ago");
  });
  it("days", () => {
    expect(formatAge(ago(24 * 60 * MIN), NOW)).toBe("1 d ago");
    expect(formatAge(ago(50 * 60 * MIN), NOW)).toBe("2 d ago");
  });
});
