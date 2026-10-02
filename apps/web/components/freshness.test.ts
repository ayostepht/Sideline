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
    expect(formatAge(ago(MIN), NOW)).toBe("1 minute ago");
    expect(formatAge(ago(2 * MIN), NOW)).toBe("2 minutes ago");
    expect(formatAge(ago(5 * MIN), NOW)).toBe("5 minutes ago");
    expect(formatAge(ago(59 * MIN), NOW)).toBe("59 minutes ago");
  });
  it("hours", () => {
    expect(formatAge(ago(60 * MIN), new Date(NOW))).toBe("1 hour ago");
    expect(formatAge(ago(120 * MIN), NOW)).toBe("2 hours ago");
    expect(formatAge(ago(23 * 60 * MIN + 59 * MIN), NOW)).toBe("23 hours ago");
  });
  it("days", () => {
    expect(formatAge(ago(24 * 60 * MIN), NOW)).toBe("1 day ago");
    expect(formatAge(ago(47 * 60 * MIN), NOW)).toBe("1 day ago");
    expect(formatAge(ago(50 * 60 * MIN), NOW)).toBe("2 days ago");
    expect(formatAge(ago(72 * 60 * MIN), NOW)).toBe("3 days ago");
  });
});
