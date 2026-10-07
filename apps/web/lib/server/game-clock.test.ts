import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLogin } from "./api-handlers";
import { resetRateLimiterForTests, verifySession } from "./auth";
import {
  GAME_CLOCK_ENV,
  gameNow,
  isGameClockPinned,
  parseGameClockOverride,
  resetGameClockForTests,
} from "./game-clock";

const saved = {
  clock: process.env[GAME_CLOCK_ENV],
  pw: process.env["APP_PASSWORD"],
  secret: process.env["SESSION_SECRET"],
};
function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  delete process.env[GAME_CLOCK_ENV];
  resetGameClockForTests();
  resetRateLimiterForTests();
});
afterEach(() => {
  restore(GAME_CLOCK_ENV, saved.clock);
  restore("APP_PASSWORD", saved.pw);
  restore("SESSION_SECRET", saved.secret);
  resetGameClockForTests();
  vi.useRealTimers();
});

describe("parseGameClockOverride", () => {
  it("returns null when unset", () => {
    expect(parseGameClockOverride(undefined)).toBeNull();
  });
  it("parses a strict ISO UTC datetime", () => {
    expect(parseGameClockOverride("2026-10-02T12:00:00Z")?.toISOString()).toBe(
      "2026-10-02T12:00:00.000Z",
    );
    expect(parseGameClockOverride("2026-10-02T12:00:00.500Z")?.getTime()).toBe(
      Date.parse("2026-10-02T12:00:00.500Z"),
    );
  });
  it.each([
    "",
    "garbage",
    "2026-10-02",
    "2026-10-02T12:00:00",
    "2026-10-02T12:00:00+02:00",
    "2026-10-02T12:00:00+00:00",
    " ",
  ])("throws naming the variable for %j", (raw) => {
    expect(() => parseGameClockOverride(raw)).toThrow(GAME_CLOCK_ENV);
  });
});

describe("gameNow", () => {
  it("returns the pinned value on every call, as a fresh Date", () => {
    process.env[GAME_CLOCK_ENV] = "2026-10-02T12:00:00Z";
    const a = gameNow();
    const b = gameNow();
    expect(a.toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(a).not.toBe(b);
    a.setFullYear(2000);
    expect(gameNow().toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(isGameClockPinned()).toBe(true);
  });
  it("tracks real time when unset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const a = gameNow().getTime();
    vi.setSystemTime(new Date("2030-01-01T00:00:05Z"));
    expect(gameNow().getTime() - a).toBe(5000);
    expect(isGameClockPinned()).toBe(false);
  });
  it("throws on an invalid value", () => {
    process.env[GAME_CLOCK_ENV] = "yesterday";
    expect(() => gameNow()).toThrow(GAME_CLOCK_ENV);
    process.env[GAME_CLOCK_ENV] = "";
    expect(() => gameNow()).toThrow(GAME_CLOCK_ENV);
  });
});

describe("security paths ignore the override", () => {
  it("handleLogin issues a session based on real time even when the clock is pinned to 2020", () => {
    const secret = "s".repeat(32);
    process.env["APP_PASSWORD"] = "correct-horse";
    process.env["SESSION_SECRET"] = secret;
    process.env[GAME_CLOCK_ENV] = "2020-01-01T00:00:00Z";
    const res = handleLogin(
      new Request("http://app.local/api/login", { method: "POST" }),
      JSON.stringify({ password: "correct-horse" }),
    );
    expect(res.status).toBe(200);
    const raw = res.headers?.["Set-Cookie"] ?? "";
    const value = raw.split(";")[0]?.slice("sideline_session=".length) ?? "";
    expect(verifySession(secret, value, new Date())).toBe(true);
    // Had the 2020 clock leaked in, the session would be long expired in real time.
    const thirtyOneDays = new Date(Date.now() + 31 * 24 * 3600 * 1000);
    expect(verifySession(secret, value, thirtyOneDays)).toBe(false);
  });
});
