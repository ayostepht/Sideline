import type { SyncJobStatus, SyncRun } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { syncSummary } from "./sync-section";

const NOW = Date.parse("2026-01-02T00:00:00.000Z");

function run(status: SyncRun["status"], finishedAt: string | null = null): SyncRun {
  return {
    id: 1,
    job: "players",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt,
    status,
    callsMade: 1,
    rowsChanged: 1,
    error: status === "failed" ? "boom" : null,
  };
}

function job(overrides: Partial<SyncJobStatus>): SyncJobStatus {
  return {
    job: "players",
    lastRun: null,
    lastSuccessAt: null,
    stale: false,
    ...overrides,
  };
}

describe("syncSummary (m4)", () => {
  it("counts an ok job as up to date", () => {
    const jobs = [job({ lastSuccessAt: "2026-01-01T00:00:00.000Z", stale: false })];
    expect(syncSummary(jobs, NOW)).toMatch(/^1 of 1 up to date\. Last sync/);
  });

  it("does not count a failed job as up to date", () => {
    const jobs = [
      job({ lastRun: run("failed"), lastSuccessAt: null }),
      job({ lastSuccessAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(syncSummary(jobs, NOW)).toMatch(/^1 of 2 up to date\./);
  });

  it("does not count a stale job as up to date", () => {
    const jobs = [job({ lastSuccessAt: "2025-01-01T00:00:00.000Z", stale: true })];
    expect(syncSummary(jobs, NOW)).toMatch(/^0 of 1 up to date\./);
  });

  it("does not count a job that has never run", () => {
    const jobs = [job({ lastRun: null, lastSuccessAt: null })];
    expect(syncSummary(jobs, NOW)).toBe("0 of 1 up to date. No sync yet.");
  });

  it("does not count a running job with no prior success", () => {
    const jobs = [job({ lastRun: run("running"), lastSuccessAt: null })];
    expect(syncSummary(jobs, NOW)).toBe("0 of 1 up to date. No sync yet.");
  });

  it("counts a running job that has a prior success", () => {
    const jobs = [
      job({ lastRun: run("running"), lastSuccessAt: "2026-01-01T00:00:00.000Z", stale: false }),
    ];
    expect(syncSummary(jobs, NOW)).toMatch(/^1 of 1 up to date\./);
  });

  it("does not throw and gives sensible copy for an empty job list", () => {
    expect(syncSummary([], NOW)).toBe("No sync data yet.");
  });

  it("does not throw on a malformed lastSuccessAt and excludes it from the latest-time max", () => {
    const jobs = [
      job({ lastSuccessAt: "not-a-date", stale: false }),
      job({ lastSuccessAt: "2026-01-01T00:00:00.000Z", stale: false }),
    ];
    expect(() => syncSummary(jobs, NOW)).not.toThrow();
    expect(syncSummary(jobs, NOW)).toMatch(/^2 of 2 up to date\. Last sync/);
  });

  it("does not throw when every lastSuccessAt is malformed", () => {
    const jobs = [job({ lastSuccessAt: "not-a-date", stale: false })];
    expect(() => syncSummary(jobs, NOW)).not.toThrow();
    expect(syncSummary(jobs, NOW)).toBe("1 of 1 up to date. No sync yet.");
  });
});
