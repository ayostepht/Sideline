import { describe, expect, it } from "vitest";
import { retryAfterSeconds, waitMinutes } from "./sync-now-button";

describe("waitMinutes", () => {
  it("rounds up and is at least 1", () => {
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(60)).toBe(1);
    expect(waitMinutes(61)).toBe(2);
    expect(waitMinutes(300)).toBe(5);
  });
});

describe("retryAfterSeconds (n1)", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");

  it("reads an integer-seconds Retry-After header", () => {
    expect(retryAfterSeconds(new Headers({ "Retry-After": "30" }), now)).toBe(30);
  });
  it("reads an HTTP-date Retry-After header", () => {
    const at = new Date(now + 45_000).toUTCString();
    expect(retryAfterSeconds(new Headers({ "Retry-After": at }), now)).toBe(45);
  });
  it("defaults to 60 when the header is missing", () => {
    expect(retryAfterSeconds(new Headers(), now)).toBe(60);
    expect(retryAfterSeconds(null, now)).toBe(60);
    expect(retryAfterSeconds(undefined, now)).toBe(60);
  });
  it("defaults to 60 for a garbage value", () => {
    expect(retryAfterSeconds(new Headers({ "Retry-After": "not-a-value" }), now)).toBe(60);
  });
});
