import { describe, expect, it } from "vitest";
import {
  firstSyncProgress,
  isTerminalPhase,
  parseRetryAfter,
  pollDelay,
  stepForPhase,
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
