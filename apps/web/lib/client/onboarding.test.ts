import { describe, expect, it } from "vitest";
import {
  failedFirstSyncJob,
  firstSyncProgress,
  isMissingTableError,
  nextAfterSelect,
  nextFailureCount,
  normalizeUsername,
  pollShouldGiveUp,
  isTerminalPhase,
  parseRetryAfter,
  pollDelay,
  stepForPhase,
  syncSinceMs,
  validateUsername,
} from "./onboarding";

describe("stepForPhase", () => {
  it("maps every phase", () => {
    expect(stepForPhase("idle")).toBe("username");
    expect(stepForPhase("resolving_user")).toBe("progress");
    expect(stepForPhase("loading_leagues")).toBe("progress");
    expect(stepForPhase("ready")).toBe("leagues");
    expect(stepForPhase("failed")).toBe("failed");
    expect(stepForPhase("worker_offline")).toBe("offline");
  });
  it("only in-flight phases keep polling", () => {
    expect(isTerminalPhase("resolving_user")).toBe(false);
    expect(isTerminalPhase("ready")).toBe(true);
    expect(isTerminalPhase("worker_offline")).toBe(true);
  });
});

describe("pollDelay", () => {
  it("starts at 1.5s and backs off to 5s", () => {
    expect(pollDelay(0)).toBe(1500);
    expect(pollDelay(1)).toBe(2250);
    expect(pollDelay(3)).toBe(5000);
    expect(pollDelay(50)).toBe(5000);
    expect(pollDelay(-2)).toBe(1500);
  });
});

const run = (status: string, finishedAt: string | null) => ({ status, finishedAt });

describe("firstSyncProgress", () => {
  const since = Date.parse("2026-10-02T12:00:00Z");
  const ok = run("success", "2026-10-02T12:01:00Z");
  it("is done when all jobs succeeded after the selection time", () => {
    const jobs = ["league", "users", "rosters"].map((job) => ({ job, lastRun: ok }));
    expect(firstSyncProgress(jobs, since).allDone).toBe(true);
  });
  it("ignores runs from before the selection", () => {
    const old = run("success", "2026-10-02T11:00:00Z");
    const jobs = [
      { job: "league", lastRun: ok },
      { job: "users", lastRun: old },
      { job: "rosters", lastRun: ok },
    ];
    const r = firstSyncProgress(jobs, since);
    expect(r.allDone).toBe(false);
    expect(r.states.users).toBe("waiting");
  });
  it("reports running, failed and missing jobs", () => {
    const r = firstSyncProgress(
      [
        { job: "league", lastRun: run("running", null) },
        { job: "users", lastRun: run("failed", "2026-10-02T12:02:00Z") },
      ],
      since,
    );
    expect(r.states).toEqual({ league: "running", users: "failed", rosters: "waiting" });
  });
  it("accepts any success when no time is given", () => {
    const jobs = ["league", "users", "rosters"].map((job) => ({
      job,
      lastRun: run("success", "2020-01-01T00:00:00Z"),
    }));
    expect(firstSyncProgress(jobs, null).allDone).toBe(true);
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("reads seconds, dates and junk", () => {
    expect(parseRetryAfter("30", now)).toBe(30);
    expect(parseRetryAfter("0", now)).toBe(1);
    expect(parseRetryAfter("Fri, 02 Oct 2026 12:01:00 GMT", now)).toBe(60);
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe("validateUsername", () => {
  it("accepts and rejects", () => {
    expect(validateUsername(" manager_04 ")).toBeNull();
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("a b")).not.toBeNull();
    expect(validateUsername("a".repeat(41))).not.toBeNull();
  });
});

describe("poll ceilings", () => {
  it("counts consecutive failures and resets on success", () => {
    let n = 0;
    for (let i = 0; i < 4; i++) n = nextFailureCount(n, false);
    expect(n).toBe(4);
    expect(nextFailureCount(n, true)).toBe(0);
  });
  it("gives up on the deadline or on 5 failures", () => {
    const base = { startedMs: 1000, deadlineMs: 90_000, failures: 0 };
    expect(pollShouldGiveUp({ ...base, nowMs: 90_999 })).toBe(false);
    expect(pollShouldGiveUp({ ...base, nowMs: 91_000 })).toBe(true);
    expect(pollShouldGiveUp({ ...base, nowMs: 2000, failures: 4 })).toBe(false);
    expect(pollShouldGiveUp({ ...base, nowMs: 2000, failures: 5 })).toBe(true);
  });
});

describe("select result and misc helpers", () => {
  it("routes by sync result", () => {
    expect(nextAfterSelect("rate_limited")).toBe("home");
    expect(nextAfterSelect("queued")).toBe("sync");
    expect(nextAfterSelect("pending_reused")).toBe("sync");
  });
  it("finds the failed job", () => {
    expect(failedFirstSyncJob({ league: "done", users: "failed", rosters: "waiting" })).toBe(
      "users",
    );
    expect(failedFirstSyncJob({ league: "done", users: "done", rosters: "running" })).toBeNull();
  });
  it("normalizes usernames", () => {
    expect(normalizeUsername("  FooBar ")).toBe("foobar");
  });
  it("detects a missing table error only", () => {
    expect(isMissingTableError(new Error("SqliteError: no such table: app_settings"))).toBe(true);
    expect(isMissingTableError(new Error("database is locked"))).toBe(false);
    expect(isMissingTableError("no such table")).toBe(false);
    expect(
      isMissingTableError(new Error("Failed query", { cause: new Error("no such table: x") })),
    ).toBe(true);
  });
});

describe("first sync completion against the server syncSince", () => {
  const since = "2026-10-02T12:00:00.000Z";
  const sinceMs = syncSinceMs(since);
  const mk = (status: string, finishedAt: string | null) => [
    { job: "league", lastRun: { status, finishedAt } },
    { job: "users", lastRun: { status, finishedAt } },
    { job: "rosters", lastRun: { status, finishedAt } },
  ];
  it("parses server time only", () => {
    expect(sinceMs).toBe(Date.parse(since));
    expect(syncSinceMs(null)).toBeNull();
    expect(syncSinceMs(undefined)).toBeNull();
    expect(syncSinceMs("not a date")).toBeNull();
  });
  it("a run finished 1 ms before syncSince does not count", () => {
    const r = firstSyncProgress(mk("success", "2026-10-02T11:59:59.999Z"), sinceMs);
    expect(r.allDone).toBe(false);
    expect(r.states.league).toBe("waiting");
  });
  it("a run finished at or after syncSince counts", () => {
    expect(firstSyncProgress(mk("success", since), sinceMs).allDone).toBe(true);
    expect(firstSyncProgress(mk("success", "2026-10-02T12:00:00.001Z"), sinceMs).allDone).toBe(
      true,
    );
  });
  it("a failed run with a null finishedAt is not treated as fresh when syncSince is set", () => {
    const r = firstSyncProgress(mk("failed", null), sinceMs);
    expect(r.states.league).toBe("waiting");
    expect(r.allDone).toBe(false);
  });
  it("without syncSince any success counts and a failure with null finishedAt is failed", () => {
    expect(firstSyncProgress(mk("success", "2020-01-01T00:00:00Z"), null).allDone).toBe(true);
    expect(firstSyncProgress(mk("failed", null), null).states.league).toBe("failed");
  });
});
