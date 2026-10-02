import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SyncRequestSchema, SyncRunSchema } from "@sideline/shared";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "./connection.js";
import {
  acquireLease,
  claimNext,
  complete,
  enqueue,
  finishRun,
  getRequest,
  lastRequestAt,
  lastSuccessAt,
  latestRunPerJob,
  listPending,
  readHeartbeat,
  readLease,
  readPlayersFetchedAt,
  reapStale,
  releaseLease,
  renewLease,
  startRun,
  writeHeartbeat,
  writePlayersFetchedAt,
} from "./sync-bookkeeping.js";

let dir: string;
let a: DbHandle;
let b: DbHandle;
const t = (ms: number): Date => new Date(Date.UTC(2026, 9, 2) + ms);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-sync-"));
  const path = dbPathFromDataDir(dir);
  a = openDb(path);
  migrate(a);
  b = openDb(path);
});
afterEach(() => {
  a.sqlite.close();
  b.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("ADR-005 item 3: sync lease", () => {
  it("ADR-005: only one of two connections acquires; the other succeeds after expiry", () => {
    expect(acquireLease(a, "worker", 1000, t(0))).toBe(true);
    expect(acquireLease(b, "cli", 1000, t(500))).toBe(false);
    expect(acquireLease(b, "cli", 1000, t(1000))).toBe(true);
    expect(readLease(a)).toEqual({ holder: "cli", expiresAtMs: t(2000).getTime() });
  });

  it("ADR-005: the same holder can re-acquire", () => {
    expect(acquireLease(a, "worker", 1000, t(0))).toBe(true);
    expect(acquireLease(b, "worker", 1000, t(100))).toBe(true);
  });

  it("ADR-005: lease renew fails for a non-holder and extends for the holder", () => {
    acquireLease(a, "worker", 1000, t(0));
    expect(renewLease(b, "cli", 1000, t(100))).toBe(false);
    expect(renewLease(a, "worker", 5000, t(100))).toBe(true);
    expect(readLease(b)?.expiresAtMs).toBe(t(5100).getTime());
    expect(acquireLease(b, "cli", 1000, t(4000))).toBe(false);
  });

  it("ADR-005: a holder whose lease was taken after expiry gets false on renew", () => {
    acquireLease(a, "worker", 1000, t(0));
    expect(acquireLease(b, "cli", 1000, t(2000))).toBe(true);
    expect(renewLease(a, "worker", 1000, t(2100))).toBe(false);
  });

  it("ADR-005: renew is false when the lease is gone; release frees it", () => {
    expect(renewLease(a, "worker", 1000, t(0))).toBe(false);
    acquireLease(a, "worker", 10_000, t(0));
    expect(releaseLease(b, "cli")).toBe(false);
    expect(readLease(a)?.holder).toBe("worker");
    expect(releaseLease(a, "worker")).toBe(true);
    expect(readLease(a)).toBeNull();
    expect(acquireLease(b, "cli", 1000, t(1))).toBe(true);
  });

  it("ignores a corrupt lease value", () => {
    a.sqlite
      .prepare("INSERT INTO app_settings (key, value) VALUES ('sync_lease', 'not json')")
      .run();
    expect(readLease(a)).toBeNull();
    expect(acquireLease(a, "w", 1000, t(0))).toBe(true);
  });
});

describe("ADR-005 item 3: sync_requests", () => {
  it("dedupes pending and running requests for the same job", () => {
    const first = enqueue(a, "stats", "api", t(0));
    const dup = enqueue(b, "stats", "cli", t(10));
    expect(dup.id).toBe(first.id);
    expect(enqueue(a, "all", "api", t(20)).id).not.toBe(first.id);
    claimNext(a, t(30));
    expect(enqueue(a, "stats", "api", t(40)).id).toBe(first.id);
    complete(a, first.id, "done", null, t(50));
    expect(enqueue(a, "stats", "api", t(60)).id).not.toBe(first.id);
  });

  it("claims oldest first and parses with the shared schema", () => {
    const r1 = enqueue(a, "stats", "api", t(0));
    const r2 = enqueue(a, "players", "cli", t(1));
    expect(listPending(a).map((r) => r.id)).toEqual([r1.id, r2.id]);
    const c1 = claimNext(a, t(5));
    expect(c1?.id).toBe(r1.id);
    expect(c1?.status).toBe("running");
    expect(c1?.startedAt).toBe(t(5).toISOString());
    expect(claimNext(b, t(6))?.id).toBe(r2.id);
    expect(claimNext(a, t(7))).toBeNull();
    for (const r of [c1, getRequest(a, r2.id)])
      expect(SyncRequestSchema.safeParse(r).success).toBe(true);
  });

  it("claim is atomic across two connections (each request claimed once)", () => {
    for (let i = 0; i < 4; i++) {
      enqueue(a, (["stats", "players", "league", "users"] as const)[i] ?? "all", "api", t(i));
    }
    const got: number[] = [];
    for (let i = 0; i < 6; i++) {
      const c = claimNext(i % 2 === 0 ? a : b, t(10 + i));
      if (c !== null) got.push(c.id);
    }
    expect(got).toHaveLength(4);
    expect(new Set(got).size).toBe(4);
    expect(got).toEqual([...got].sort((x, y) => x - y));
  });

  it("complete records status, error and finish time; getRequest of unknown id is null", () => {
    const r = enqueue(a, "state", "cli", t(0));
    claimNext(a, t(1));
    complete(a, r.id, "failed", "boom", t(2));
    const got = getRequest(b, r.id);
    expect(got).toMatchObject({ status: "failed", error: "boom", finishedAt: t(2).toISOString() });
    expect(getRequest(a, 9999)).toBeNull();
  });

  it("lastRequestAt returns the newest request time for a job", () => {
    expect(lastRequestAt(a, "stats")).toBeNull();
    const r = enqueue(a, "stats", "api", t(0));
    complete(a, r.id, "done", null, t(1));
    enqueue(a, "stats", "api", t(2000));
    expect(lastRequestAt(a, "stats")).toBe(t(2000).toISOString());
    expect(lastRequestAt(a, "players")).toBeNull();
  });
});

describe("T1.3a sync_runs, heartbeat and players guard", () => {
  it("round-trips runs and latestRunPerJob / lastSuccessAt", () => {
    const r1 = startRun(a, "stats", t(0));
    finishRun(a, r1, { status: "success", callsMade: 3, rowsChanged: 10, error: null }, t(100));
    const r2 = startRun(a, "stats", t(200));
    finishRun(a, r2, { status: "failed", callsMade: 1, rowsChanged: 0, error: "x" }, t(300));
    const r3 = startRun(a, "league", t(400));
    const latest = latestRunPerJob(b);
    expect(latest.map((r) => [r.job, r.id, r.status])).toEqual([
      ["league", r3, "running"],
      ["stats", r2, "failed"],
    ]);
    for (const r of latest) expect(SyncRunSchema.safeParse(r).success).toBe(true);
    expect(latest[0]?.finishedAt).toBeNull();
    expect(lastSuccessAt(a, "stats")).toBe(t(100).toISOString());
    expect(lastSuccessAt(a, "league")).toBeNull();
  });

  it("round-trips the heartbeat; unreadable value reads as null", () => {
    expect(readHeartbeat(a)).toBeNull();
    writeHeartbeat(a, t(5), { pid: 7 });
    expect(readHeartbeat(b)).toEqual({ at: t(5).toISOString(), info: { pid: 7 } });
    writeHeartbeat(a, t(9));
    expect(readHeartbeat(a)).toEqual({ at: t(9).toISOString(), info: {} });
    a.sqlite.prepare("UPDATE app_settings SET value = '{' WHERE key = 'worker_heartbeat'").run();
    expect(readHeartbeat(a)).toBeNull();
  });

  it("round-trips the players fetched-at guard", () => {
    expect(readPlayersFetchedAt(a)).toBeNull();
    writePlayersFetchedAt(a, t(1));
    writePlayersFetchedAt(a, t(2));
    expect(readPlayersFetchedAt(b)).toBe(t(2).toISOString());
  });
});

describe("M3: stale running rows", () => {
  const STALE = 15 * 60 * 1000;

  it("a stale running request no longer blocks enqueue", () => {
    const first = enqueue(a, "all", "api", t(0));
    claimNext(a, t(0));
    const again = enqueue(a, "all", "api", t(STALE - 1));
    expect(again.id).toBe(first.id);
    const fresh = enqueue(a, "all", "api", t(STALE + 1));
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.status).toBe("pending");
  });

  it("reapStale fails stale running rows and leaves fresh ones", () => {
    const oldReq = enqueue(a, "players", "api", t(0));
    claimNext(a, t(0));
    const oldRun = startRun(a, "players", t(0));
    const newReq = enqueue(a, "all", "api", t(STALE));
    claimNext(a, t(STALE));
    const newRun = startRun(a, "league", t(STALE));
    const counts = reapStale(a, t(STALE + 1000), STALE / 2);
    expect(counts).toEqual({ requests: 1, runs: 1 });
    expect(getRequest(a, oldReq.id)).toMatchObject({
      status: "failed",
      error: "interrupted (worker restart)",
    });
    expect(getRequest(a, newReq.id)?.status).toBe("running");
    const runs = latestRunPerJob(a);
    expect(runs.find((r) => r.id === oldRun)?.status).toBe("failed");
    expect(runs.find((r) => r.id === newRun)?.status).toBe("running");
    expect(reapStale(a, t(STALE + 1000), STALE / 2)).toEqual({ requests: 0, runs: 0 });
  });
});

describe("m1: lease holder identity", () => {
  it("a distinct holder is rejected while the lease is held", () => {
    expect(acquireLease(a, "host:1:abc", 1000, t(0))).toBe(true);
    expect(acquireLease(b, "host:2:def", 1000, t(10))).toBe(false);
    expect(renewLease(b, "host:2:def", 1000, t(10))).toBe(false);
  });
});
