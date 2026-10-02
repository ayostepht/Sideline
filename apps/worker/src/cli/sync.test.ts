import {
  acquireLease,
  dbPathFromDataDir,
  getRequest,
  openDb,
  readLease,
  writeHeartbeat,
  claimNext,
  complete,
} from "@sideline/db";
import { RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { createJobRegistry } from "../registry.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "../testutil.js";
import type { Job } from "../types.js";
import { parseArgs, runSyncCli, type CliDeps } from "./sync.js";

function mk(jobs: Job[], dir = tempDataDir(), clock = fakeClock("2025-10-19T17:00:00Z")) {
  const out: string[] = [];
  const deps: CliDeps = {
    config: testConfig(dir),
    registry: createJobRegistry(jobs),
    limiter: new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100000 }),
    logger: silent,
    now: clock.now,
    sleep: (ms) => {
      clock.advance(ms);
      return Promise.resolve();
    },
    out: (l) => out.push(l),
    holder: "cli-1",
  };
  return { dir, clock, out, deps };
}

const job = (name: Job["name"], ran: string[], fail = false): Job => ({
  name,
  run: async (ctx) => {
    ran.push(name);
    await ctx.limiter.acquire(ctx.counter);
    if (fail) throw new Error("bad");
    return { rowsChanged: 2 };
  },
});

describe("parseArgs", () => {
  it("validates", () => {
    expect(parseArgs(["--once"])).toEqual({ ok: true, job: "all" });
    expect(parseArgs(["--once", "--job=state"])).toEqual({ ok: true, job: "state" });
    expect(parseArgs([]).ok).toBe(false);
    expect(parseArgs(["--once", "--job=nope"]).ok).toBe(false);
    expect(parseArgs(["--once", "--x"]).ok).toBe(false);
  });
});

describe("runSyncCli", () => {
  it("exits 2 when no job is registered", async () => {
    const m = mk([]);
    expect(await runSyncCli(["--once", "--job=state"], m.deps)).toBe(2);
    expect(m.out.join()).toContain("no job registered");
    expect(await runSyncCli(["--once"], m.deps)).toBe(2);
    expect(await runSyncCli([], m.deps)).toBe(2);
  });

  it("no worker: runs directly holding the lease, releases after, reports counts", async () => {
    const ran: string[] = [];
    const m = mk([job("state", ran), job("league", ran)]);
    expect(await runSyncCli(["--once"], m.deps)).toBe(0);
    expect(ran).toEqual(["state", "league"]);
    expect(m.out[0]).toContain("state: success, 1 calls, 2 rows changed");
    const db = openDb(dbPathFromDataDir(m.dir));
    expect(readLease(db)).toBeNull();
    db.sqlite.close();
  });

  it("exits 1 when a job fails", async () => {
    const ran: string[] = [];
    const m = mk([job("state", ran, true), job("league", ran)]);
    expect(await runSyncCli(["--once"], m.deps)).toBe(1);
    expect(ran).toEqual(["state", "league"]);
  });

  it("lease held by another process: exits 2 without running", async () => {
    const ran: string[] = [];
    const m = mk([job("state", ran)]);
    const db = tempDb(m.dir);
    acquireLease(db, "other", 120_000, m.clock.now());
    expect(await runSyncCli(["--once", "--job=state"], m.deps)).toBe(2);
    expect(ran).toEqual([]);
    expect(m.out.join()).toContain("lease");
    db.sqlite.close();
  });

  it("worker alive: enqueues and waits, never runs the job itself", async () => {
    const ran: string[] = [];
    const m = mk([job("state", ran)]);
    const db = tempDb(m.dir);
    writeHeartbeat(db, m.clock.now());
    // Simulated worker: completes the request on the first sleep.
    let sleeps = 0;
    m.deps.sleep = (ms) => {
      m.clock.advance(ms);
      if (sleeps++ === 1) {
        const r = claimNext(db, m.clock.now());
        if (r !== null) complete(db, r.id, "done", null, m.clock.now());
      }
      return Promise.resolve();
    };
    expect(await runSyncCli(["--once", "--job=state"], m.deps)).toBe(0);
    expect(ran).toEqual([]);
    expect(getRequest(db, 1)?.source).toBe("cli");
    db.sqlite.close();
  });

  it("worker alive but request fails: exit 1; never completes: times out with exit 1", async () => {
    const m = mk([job("state", [])]);
    const db = tempDb(m.dir);
    writeHeartbeat(db, m.clock.now());
    m.deps.pollMs = 60_000;
    expect(await runSyncCli(["--once", "--job=state"], m.deps)).toBe(1);
    expect(m.out.join()).toContain("timed out");
    db.sqlite.close();
  });

  it("a stale heartbeat is treated as no worker", async () => {
    const ran: string[] = [];
    const m = mk([job("state", ran)]);
    const db = tempDb(m.dir);
    writeHeartbeat(db, new Date(m.clock.now().getTime() - 3_600_000));
    expect(await runSyncCli(["--once", "--job=state"], m.deps)).toBe(0);
    expect(ran).toEqual(["state"]);
    db.sqlite.close();
  });
});
