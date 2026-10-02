import { describe, expect, it } from "vitest";
import {
  ONBOARDING_JOB_NAMES,
  OnboardingStartRequestSchema,
  OnboardingStatusSchema,
  PlayerSearchRequestSchema,
  SYNC_JOB_NAMES,
  SyncRequestSchema,
  TeamDetailSchema,
  UserLeaguesJobParamsSchema,
  computeFreshness,
  parseParamsForJob,
} from "./index.js";

describe("onboarding jobs", () => {
  it("are separate from scheduled sync jobs", () => {
    for (const j of ONBOARDING_JOB_NAMES) expect(SYNC_JOB_NAMES).not.toContain(j);
  });
  it("sync request accepts onboarding jobs with params, and without params", () => {
    const base = {
      id: 1,
      requestedAt: "2026-01-01T00:00:00.000Z",
      status: "pending",
      source: "api",
      startedAt: null,
      finishedAt: null,
      error: null,
    };
    expect(
      SyncRequestSchema.safeParse({ ...base, job: "user", params: { username: "a_b" } }).success,
    ).toBe(true);
    expect(SyncRequestSchema.safeParse({ ...base, job: "state" }).success).toBe(true);
    expect(SyncRequestSchema.safeParse({ ...base, job: "nope" }).success).toBe(false);
  });
});

describe("username params", () => {
  it("trims and accepts valid names", () => {
    const r = OnboardingStartRequestSchema.parse({ username: "  fake_user.1 " });
    expect(r.username).toBe("fake_user.1");
    expect(parseParamsForJob("user", { username: "x" })).toEqual({ username: "x" });
  });
  it("rejects empty, too long, bad charset and extra keys", () => {
    expect(OnboardingStartRequestSchema.safeParse({ username: "   " }).success).toBe(false);
    expect(OnboardingStartRequestSchema.safeParse({ username: "a".repeat(41) }).success).toBe(
      false,
    );
    expect(OnboardingStartRequestSchema.safeParse({ username: "a".repeat(40) }).success).toBe(true);
    expect(OnboardingStartRequestSchema.safeParse({ username: "bad name" }).success).toBe(false);
    expect(OnboardingStartRequestSchema.safeParse({ username: "a/b" }).success).toBe(false);
    expect(parseParamsForJob("user", { username: "x", extra: 1 })).toBeNull();
  });
  it("user_leagues params", () => {
    expect(UserLeaguesJobParamsSchema.safeParse({ userId: "1", season: 2026 }).success).toBe(true);
    expect(UserLeaguesJobParamsSchema.safeParse({ userId: "1", season: 2026.5 }).success).toBe(
      false,
    );
    expect(parseParamsForJob("user_leagues", { userId: "", season: 1 })).toBeNull();
    expect(parseParamsForJob("state", {})).toBeNull();
  });
});

describe("onboarding status", () => {
  it("accepts every phase and rejects unknown", () => {
    for (const phase of [
      "idle",
      "resolving_user",
      "loading_leagues",
      "ready",
      "failed",
      "worker_offline",
    ]) {
      expect(OnboardingStatusSchema.safeParse({ phase }).success).toBe(true);
    }
    expect(OnboardingStatusSchema.safeParse({ phase: "done" }).success).toBe(false);
  });
  it("validates nested leagues", () => {
    const league = {
      leagueId: "1",
      name: "L",
      season: 2026,
      totalRosters: 10,
      status: "in_season",
      avatar: null,
    };
    expect(OnboardingStatusSchema.safeParse({ phase: "ready", leagues: [league] }).success).toBe(
      true,
    );
    expect(
      OnboardingStatusSchema.safeParse({ phase: "ready", leagues: [{ ...league, avatar: 3 }] })
        .success,
    ).toBe(false);
  });
});

describe("player search request", () => {
  it("bounds q and limit, defaults limit to 10", () => {
    expect(PlayerSearchRequestSchema.parse({ q: "ab" }).limit).toBe(10);
    expect(PlayerSearchRequestSchema.safeParse({ q: "a" }).success).toBe(false);
    expect(PlayerSearchRequestSchema.safeParse({ q: "a".repeat(41) }).success).toBe(false);
    expect(PlayerSearchRequestSchema.safeParse({ q: "a".repeat(40) }).success).toBe(true);
    expect(PlayerSearchRequestSchema.parse({ q: "ab", limit: "25" }).limit).toBe(25);
    expect(PlayerSearchRequestSchema.safeParse({ q: "ab", limit: 26 }).success).toBe(false);
    expect(PlayerSearchRequestSchema.safeParse({ q: "ab", limit: 0 }).success).toBe(false);
  });
});

describe("computeFreshness", () => {
  const cadence = 1000;
  const now = Date.parse("2026-01-01T00:00:10.000Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  it("exactly 2x cadence is not stale, just over is", () => {
    expect(computeFreshness(iso(now - 2000), cadence, now).stale).toBe(false);
    expect(computeFreshness(iso(now - 2001), cadence, now).stale).toBe(true);
  });
  it("null cadence never stale; null last success is stale", () => {
    expect(computeFreshness(iso(now - 1e12), null, now).stale).toBe(false);
    expect(computeFreshness(null, cadence, now)).toEqual({ updatedAt: null, stale: true });
  });
  it("unparseable timestamps count as stale", () => {
    expect(computeFreshness("garbage", cadence, now).stale).toBe(true);
  });
});

describe("team detail", () => {
  it("validates a minimal detail", () => {
    const roster = {
      rosterId: 1,
      ownerId: null,
      teamName: "Team 1",
      managerName: null,
      avatar: null,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      rank: 1,
      division: null,
      isMine: false,
    };
    expect(
      TeamDetailSchema.safeParse({
        roster,
        players: [],
        emptySlots: ["QB"],
        freshness: { updatedAt: null, stale: true },
      }).success,
    ).toBe(true);
  });
});
