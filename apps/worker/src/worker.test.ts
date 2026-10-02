import {
  enqueue,
  getRequest,
  readHeartbeat,
  startRun,
  acquireLease,
  readLease,
} from "@sideline/db";
import { RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { LeaseKeeper } from "./lease.js";
import { createJobRegistry } from "./registry.js";
import { runJob } from "./runner.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "./testutil.js";
import type { Job } from "./types.js";
import { Worker, raceTimeout } from "./worker.js";
import { openDb, dbPathFromDataDir } from "@sideline/db";
import { LEASE_TTL_MS } from "./lease.js";
import { INTERRUPTED_ERROR } from "@sideline/db";

const fast = (): RateLimiter => new RateLimiter({ ratePerSecond: 1000, maxPerWindow: 100000 });

function setup(
  jobs: Job[],
  opts: { holder?: string; dir?: string; clock?: ReturnType<typeof fakeClock> } = {},
) {
  const dir = opts.dir ?? tempDataDir();
  const db = tempDb(dir);
  const clock = opts.clock ?? fakeClock("2025-10-19T17:00:00Z");
  const lease = new LeaseKeeper(db, opts.holder ?? "w1", clock.now);
  const worker = new Worker({
    db,
    config: testConfig(dir),
    registry: createJobRegistry(jobs),
    limiter: fast(),
    logger: silent,
    lease,
    now: clock.now,
    loadGames: () => [],
  });
  return { dir, db, clock, lease, worker };
}

const okJob = (name: Job["name"], log: string[] = [], rows = 1): Job => ({
  name,
  run: () => {
    log.push(name);
    return Promise.resolve({ rowsChanged: rows });
  },
});

function runs(db: ReturnType<typeof tempDb>) {
  return db.sqlite
    .prepare(
      "SELECT job, status, calls_made AS calls, rows_changed AS rows, error FROM sync_runs ORDER BY id",
    )
    .all() as {
    job: string;
    status: string;
    calls: number;
    rows: number;
    error: string | null;
  }[];
}

describe("runJob", () => {
  it("records failure and the next job still runs; never throws", async () => {
    const log: string[] = [];
    const bad: Job = {
      name: "state",
      run: () => {
        return Promise.reject(new Error("boom"));
      },
    };
    const s = setup([bad, okJob("league", log)]);
    s.lease.tryAcquire();
    s.worker.acquireTick();
    enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(log).toEqual(["league"]);
    const r = runs(s.db);
    expect(r[0]).toMatchObject({ job: "state", status: "failed", error: "boom" });
    expect(r[1]).toMatchObject({ job: "league", status: "success", rows: 1 });
    const req = getRequest(s.db, 1);
    expect(req?.status).toBe("failed");
    expect(req?.error).toContain("state: boom");
  });

  it("calls_made equals limiter acquisitions through ctx.counter; skipped status passes through", async () => {
    const s = setup([]);
    const job: Job = {
      name: "stats",
      run: async (ctx) => {
        await ctx.limiter.acquire(ctx.counter);
        await ctx.limiter.acquire(ctx.counter);
        await ctx.limiter.acquire(ctx.counter);
        return { rowsChanged: 0, status: "skipped" };
      },
    };
    const out = await runJob(
      {
        db: s.db,
        limiter: fast(),
        logger: silent,
        config: testConfig(s.dir),
        now: s.clock.now,
        signal: () => new AbortController().signal,
      },
      job,
    );
    expect(out.callsMade).toBe(3);
    expect(runs(s.db)[0]).toMatchObject({ status: "skipped", calls: 3 });
  });
});

describe("requests", () => {
  it("runs a claimed single-job request and completes it", async () => {
    const log: string[] = [];
    const s = setup([okJob("rosters", log), okJob("state", log)]);
    s.worker.acquireTick();
    const req = enqueue(s.db, "rosters", "api", s.clock.now());
    await s.worker.pollTick();
    expect(log).toEqual(["rosters"]);
    expect(getRequest(s.db, req.id)?.status).toBe("done");
  });
  it("'all' runs in the defined order and excludes backfill_2025", async () => {
    const log: string[] = [];
    const names = [
      "nflverse",
      "backfill_2025",
      "projections",
      "players",
      "matchups",
      "state",
    ] as const;
    const s = setup(names.map((n) => okJob(n, log)));
    s.worker.acquireTick();
    enqueue(s.db, "all", "api", s.clock.now());
    await s.worker.pollTick();
    expect(log).toEqual(["state", "matchups", "players", "projections", "nflverse"]);
  });
  it("an unregistered single job request fails cleanly", async () => {
    const s = setup([]);
    s.worker.acquireTick();
    const req = enqueue(s.db, "stats", "api", s.clock.now());
    await s.worker.pollTick();
    expect(getRequest(s.db, req.id)).toMatchObject({ status: "failed" });
  });
});

describe("scheduler", () => {
  it("runs due jobs once, not again until the cadence elapses", async () => {
    const log: string[] = [];
    const s = setup([okJob("state", log)]);
    s.worker.acquireTick();
    await s.worker.scheduleTick();
    await s.worker.scheduleTick();
    expect(log).toEqual(["state"]);
    s.clock.advance(15 * 60_000);
    await s.worker.scheduleTick();
    expect(log).toEqual(["state", "state"]);
  });
  it("does not retry a failing job every tick", async () => {
    let n = 0;
    const s = setup([
      {
        name: "state",
        run: () => {
          n++;
          return Promise.reject(new Error("x"));
        },
      },
    ]);
    s.worker.acquireTick();
    await s.worker.scheduleTick();
    s.clock.advance(60_000);
    await s.worker.scheduleTick();
    expect(n).toBe(1);
  });
});

describe("lease", () => {
  it("second worker waits while the first holds the lease", () => {
    const first = setup([], { holder: "a" });
    const second = setup([], { holder: "b", dir: first.dir, clock: first.clock });
    expect(first.worker.acquireTick()).toBe(true);
    expect(second.worker.acquireTick()).toBe(false);
    expect(second.lease.held).toBe(false);
    first.lease.release();
    expect(second.worker.acquireTick()).toBe(true);
  });

  it("losing the lease aborts the running job and stops scheduling", async () => {
    let aborted = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const log: string[] = [];
    const slow: Job = {
      name: "state",
      run: async (ctx) => {
        ctx.signal.addEventListener("abort", () => {
          aborted = true;
          release();
        });
        await gate;
        return { rowsChanged: 0 };
      },
    };
    const s = setup([slow, okJob("league", log)]);
    s.worker.acquireTick();
    const running = s.worker.scheduleTick();
    // Simulate another holder taking over after our lease expired.
    s.clock.advance(LEASE_TTL_MS + 1);
    const other = openDb(dbPathFromDataDir(s.dir));
    expect(acquireLease(other, "other", LEASE_TTL_MS, s.clock.now())).toBe(true);
    expect(s.worker.renewTick()).toBe(false);
    await running;
    expect(aborted).toBe(true);
    expect(s.lease.held).toBe(false);
    expect(log).toEqual([]); // league not run after abort
    await s.worker.scheduleTick(); // no-op without lease
    expect(log).toEqual([]);
    expect(readLease(s.db)?.holder).toBe("other");
    other.sqlite.close();
  });

  it("boot reaps stale running rows and writes a heartbeat", () => {
    const s = setup([]);
    startRun(s.db, "state", s.clock.now());
    enqueue(s.db, "all", "api", s.clock.now());
    s.clock.advance(1000);
    s.worker.acquireTick();
    expect(runs(s.db)[0]).toMatchObject({ status: "failed", error: INTERRUPTED_ERROR });
    expect(readHeartbeat(s.db)?.at).toBe(s.clock.now().toISOString());
  });

  it("stop releases the lease", async () => {
    const s = setup([]);
    s.worker.acquireTick();
    await s.worker.stop();
    expect(readLease(s.db)).toBeNull();
    expect(acquireLease(s.db, "x", 1000, s.clock.now())).toBe(true);
  });
});

describe("start timers", () => {
  it("start schedules ticks and stop clears them", async () => {
    const s = setup([]);
    s.worker.start();
    expect(s.lease.held).toBe(true);
    await s.worker.stop();
  });
});

describe("restart behavior", () => {
  it("seeds lastAttempt from failed runs so a failing job is not rerun at boot", async () => {
    const log: string[] = [];
    const s = setup([okJob("state", log), okJob("league", log)]);
    const id = startRun(s.db, "state", s.clock.now());
    s.db.sqlite
      .prepare("UPDATE sync_runs SET status='failed', finished_at=? WHERE id=?")
      .run(s.clock.now().toISOString(), id);
    s.clock.advance(1000);
    s.worker.acquireTick();
    await s.worker.scheduleTick();
    expect(log).toEqual(["league"]);
  });

  it("re-acquire while a job winds down does not reap its running rows", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow: Job = { name: "state", run: () => gate.then(() => ({ rowsChanged: 0 })) };
    const s = setup([slow]);
    s.worker.acquireTick();
    enqueue(s.db, "state", "api", s.clock.now());
    const running = s.worker.pollTick();
    await new Promise((r) => setTimeout(r, 20));
    expect(runs(s.db)[0]?.status).toBe("running");
    const other = openDb(dbPathFromDataDir(s.dir));
    s.clock.advance(LEASE_TTL_MS + 1);
    acquireLease(other, "other", LEASE_TTL_MS, s.clock.now());
    expect(s.worker.renewTick()).toBe(false);
    other.sqlite.close();
    s.db.sqlite.prepare("DELETE FROM app_settings WHERE key = 'sync_lease'").run();
    s.clock.advance(1000);
    expect(s.worker.acquireTick()).toBe(true);
    expect(runs(s.db)[0]?.status).toBe("running");
    release();
    await running;
  });
});

describe("raceTimeout", () => {
  it("resolves on timeout when the promise hangs, and on settle otherwise", async () => {
    const t0 = Date.now();
    await raceTimeout(new Promise(() => undefined), 30);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
    await raceTimeout(Promise.reject(new Error("x")), 5000);
  });
});
