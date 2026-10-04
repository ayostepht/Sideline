import { beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  clearedSessionCookie,
  constantTimeStringEqual,
  isRateLimited,
  rateLimiterSizeForTests,
  resetRateLimiterForTests,
  signSession,
  verifySession,
} from "./auth";

describe("signSession / verifySession", () => {
  const secret = "a".repeat(32);
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("verifies a freshly signed session", () => {
    const value = signSession(secret, now);
    expect(verifySession(secret, value, now)).toBe(true);
  });

  it("rejects an expired session", () => {
    const value = signSession(secret, now);
    const thirtyOneDaysLater = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(verifySession(secret, value, thirtyOneDaysLater)).toBe(false);
  });

  it("accepts a session just before expiry and rejects it just after", () => {
    const value = signSession(secret, now);
    const justBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 - 1000);
    const justAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 + 1000);
    expect(verifySession(secret, value, justBefore)).toBe(true);
    expect(verifySession(secret, value, justAfter)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const value = signSession(secret, now);
    const dot = value.lastIndexOf(".");
    const tampered = `${Number(value.slice(0, dot)) + 1}.${value.slice(dot + 1)}`;
    expect(verifySession(secret, tampered, now)).toBe(false);
  });

  it("rejects a session signed with a different secret", () => {
    const value = signSession(secret, now);
    expect(verifySession("b".repeat(32), value, now)).toBe(false);
  });

  it("rejects undefined, empty, and malformed cookie values", () => {
    expect(verifySession(secret, undefined, now)).toBe(false);
    expect(verifySession(secret, "", now)).toBe(false);
    expect(verifySession(secret, "no-dot-here", now)).toBe(false);
  });
});

describe("constantTimeStringEqual", () => {
  it("true for identical strings", () => {
    expect(constantTimeStringEqual("secret", "secret")).toBe(true);
  });
  it("false for different strings of the same length", () => {
    expect(constantTimeStringEqual("secret", "secrFt")).toBe(false);
  });
  it("false for different lengths without throwing", () => {
    expect(constantTimeStringEqual("secret", "a-much-longer-string")).toBe(false);
    expect(constantTimeStringEqual("", "secret")).toBe(false);
  });
});

describe("buildSessionCookie / clearedSessionCookie", () => {
  it("includes HttpOnly, SameSite=Lax, and the cookie name, with Secure only on https", () => {
    const insecure = buildSessionCookie("v", false);
    expect(insecure).toContain(`${SESSION_COOKIE_NAME}=v`);
    expect(insecure).toContain("HttpOnly");
    expect(insecure).toContain("SameSite=Lax");
    expect(insecure).not.toContain("Secure");

    const secure = buildSessionCookie("v", true);
    expect(secure).toContain("Secure");
  });

  it("30-day max-age", () => {
    const cookie = buildSessionCookie("v", false);
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it("clears with Max-Age=0", () => {
    expect(clearedSessionCookie(false)).toContain("Max-Age=0");
    expect(clearedSessionCookie(true)).toContain("Secure");
  });
});

describe("isRateLimited", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  it("allows 5 attempts per IP per minute and blocks the 6th", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i += 1) {
      expect(isRateLimited("1.2.3.4", now)).toBe(false);
    }
    expect(isRateLimited("1.2.3.4", now)).toBe(true);
  });

  it("tracks IPs independently", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i += 1) expect(isRateLimited("1.1.1.1", now)).toBe(false);
    expect(isRateLimited("1.1.1.1", now)).toBe(true);
    expect(isRateLimited("2.2.2.2", now)).toBe(false);
  });

  it("resets after the window elapses", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i += 1) expect(isRateLimited("1.2.3.4", now)).toBe(false);
    expect(isRateLimited("1.2.3.4", now)).toBe(true);
    const later = new Date(now.getTime() + 61_000);
    expect(isRateLimited("1.2.3.4", later)).toBe(false);
  });

  it("counts every attempt, not just failures: a run of successes still gets rate-limited", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    // Simulate 5 "successful" checks plus one more; the caller is responsible for calling this
    // once per attempt regardless of outcome, so the limiter itself has no notion of success.
    for (let i = 0; i < 5; i += 1) isRateLimited("9.9.9.9", now);
    expect(isRateLimited("9.9.9.9", now)).toBe(true);
  });

  it("bounds its memory under a sustained flood of distinct (e.g. spoofed) IPs: map size stays proportional to one window of traffic, not all-time traffic", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const ipsPerWindow = 200;
    const windows = 25; // far more than one window's worth of distinct keys, if unbounded

    for (let w = 0; w < windows; w += 1) {
      const windowNow = new Date(start.getTime() + w * 61_000); // > RATE_LIMIT_WINDOW_MS apart
      for (let i = 0; i < ipsPerWindow; i += 1) {
        isRateLimited(`10.0.${w}.${i}`, windowNow);
      }
      // After each window, the map holds at most this window's distinct keys: the sweep on the
      // next window's first call drops everything from the prior window before adding new keys.
      expect(rateLimiterSizeForTests()).toBeLessThanOrEqual(ipsPerWindow);
    }

    // Total distinct keys ever seen across all windows would be ipsPerWindow * windows (5000) if
    // the map were unbounded; it must stay bounded by a single window's worth instead.
    expect(rateLimiterSizeForTests()).toBeLessThanOrEqual(ipsPerWindow);
    expect(rateLimiterSizeForTests()).toBeLessThan(ipsPerWindow * windows);
  });

  it("still tracks a real IP correctly while many distinct fake IPs cycle through other windows", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i += 1) expect(isRateLimited("8.8.8.8", now)).toBe(false);
    expect(isRateLimited("8.8.8.8", now)).toBe(true);

    // A flood of unrelated fake IPs in the same window does not reset or evict the real IP's
    // entry early: the sweep only drops entries whose own window has fully elapsed, and this
    // window has not elapsed yet.
    for (let i = 0; i < 50; i += 1) isRateLimited(`192.0.2.${i}`, now);
    expect(isRateLimited("8.8.8.8", now)).toBe(true);
  });
});
