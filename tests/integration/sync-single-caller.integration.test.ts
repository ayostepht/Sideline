import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { acquireLease, claimNext, readLease, writeHeartbeat } from "../../packages/db/src/index.js";
import type { SyncRequest } from "../../packages/shared/src/index.js";
import { LEASE_TTL_MS, LeaseKeeper } from "../../apps/worker/src/lease.js";
import { createJobRegistry } from "../../apps/worker/src/registry.js";
import { runSyncCli, type CliDeps } from "../../apps/worker/src/cli/sync.js";
import type { Job } from "../../apps/worker/src/types.js";
import { Worker } from "../../apps/worker/src/worker.js";
import { POST } from "../../apps/web/app/api/sync/run/route.js";
import { resetDbForTests } from "../../apps/web/lib/server/db.js";
import { createSleeperServer, recordedFixtureRoot } from "../msw/server.js";
import {
  createNflverseMock,
  createSyncHarness,
  type SyncHarness,
} from "../helpers/sync-harness.js";

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let h: SyncHarness;
let sleeperWire: string[] = [];
server.events.on("request:start", ({ request }) => {
  const url = new URL(request.url);
  if (url.hostname === "api.sleeper.app") sleeperWire.push(url.pathname);
});

const savedDataDir = process.env["DATA_DIR"];
beforeAll(() => server.listen());
beforeEach(() => {
  sleeperWire = [];
  server.use(createNflverseMock().handler);
  h = createSyncHarness();
  process.env["DATA_DIR"] = h.tmp.dataDir;
  resetDbForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetDbForTests();
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => {
  server.close();
  if (savedDataDir === undefined) delete process.env["DATA_DIR"];
  else process.env["DATA_DIR"] = savedDataDir;
});

function post(job: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/sync/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job }),
    }),
  );
}

function makeWorker(holder: string): { worker: Worker; lease: LeaseKeeper } {
  const lease = new LeaseKeeper(h.tmp.handle, holder, () => h.clock.now());
  const worker = new Worker({
    db: h.tmp.handle,
    config: h.config,
    registry: h.registry,
    limiter: h.limiter,
    logger: h.logger,
    lease,
    now: () => h.clock.now(),
  });
  return { worker, lease };
}

function requestRows(): SyncRequest[] {
  return h.tmp.handle.sqlite
    .prepare("SELECT * FROM sync_requests ORDER BY id")
    .all() as SyncRequest[];
}

function cliDeps(over: Partial<CliDeps> = {}): { deps: CliDeps; out: string[] } {
  const out: string[] = [];
  return {
    out,
    deps: {
      config: h.config,
      registry: h.registry,
      limiter: h.limiter,
      logger: h.logger,
      now: () => h.clock.now(),
      sleep: (ms) => h.clock.sleep(ms),
      out: (l) => out.push(l),
      holder: "cli-test",
      ...over,
    },
  };
}

describe("T1.7b: single Sleeper caller (ADR-005)", () => {
  it("SINGLE-1: POST /api/sync/run only queues a request; the worker poll runs it and marks it done", async () => {
    const res = await post("state");
    expect(res.status).toBe(202);
    const rows = requestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ job: "state", status: "pending", source: "api" });
    expect(sleeperWire).toEqual([]); // the web handler made zero Sleeper requests
    expect(h.runs()).toEqual([]);

    const { worker, lease } = makeWorker("worker-1");
    expect(worker.acquireTick()).toBe(true);
    await worker.pollTick();
    expect(sleeperWire).toEqual(["/v1/state/nfl"]); // now the worker, and only it, called Sleeper
    expect(requestRows()[0]).toMatchObject({ status: "done", error: null });
    expect(h.runs().map((r) => [r.job, r.status])).toEqual([["state", "success"]]);
    expect(h.count("nfl_state")).toBe(1);
    lease.release();
  });

  it("SINGLE-2: a duplicate POST while one is active is deduplicated, not queued twice", async () => {
    expect((await post("state")).status).toBe(202);
    const second = await post("state");
    expect(second.status).toBe(200);
    expect(requestRows()).toHaveLength(1);
  });
});

describe("T1.7b: sync CLI and lease (ADR-005 items 3, 4, 6)", () => {
  it("CLI-1: with a live worker the CLI enqueues, waits, and never calls Sleeper itself", async () => {
    const { worker, lease } = makeWorker("worker-1");
    expect(worker.acquireTick()).toBe(true); // also writes the heartbeat
    let wireWhileWaiting = -1;
    let runsWhileWaiting = -1;
    const { deps, out } = cliDeps({
      sleep: async (ms) => {
        // The CLI is only waiting here. Record what it has done so far, then let the worker poll.
        if (wireWhileWaiting < 0) {
          wireWhileWaiting = sleeperWire.length;
          runsWhileWaiting = h.runs().length;
        }
        h.clock.advance(ms);
        writeHeartbeat(h.tmp.handle, h.clock.now(), { holder: "worker-1" });
        await worker.pollTick();
      },
    });
    const code = await runSyncCli(["--once", "--job=state"], deps);
    expect(code).toBe(0);
    expect(wireWhileWaiting).toBe(0);
    expect(runsWhileWaiting).toBe(0);
    expect(out.join("\n")).toMatch(/worker is running; queued request #1/);
    expect(requestRows()[0]).toMatchObject({ source: "cli", status: "done" });
    expect(readLease(h.tmp.handle)?.holder).toBe("worker-1"); // the CLI never took the lease
    expect(sleeperWire).toEqual(["/v1/state/nfl"]);
    lease.release();
  });

  it("CLI-2a: no heartbeat at all: the CLI runs the job itself and releases the lease", async () => {
    const { deps } = cliDeps();
    expect(await runSyncCli(["--once", "--job=state"], deps)).toBe(0);
    expect(sleeperWire).toEqual(["/v1/state/nfl"]);
    expect(h.runs().map((r) => [r.job, r.status])).toEqual([["state", "success"]]);
    expect(requestRows()).toEqual([]); // nothing queued
    expect(readLease(h.tmp.handle)).toBeNull();
  });

  it("CLI-2b: a stale heartbeat (older than WORKER_STALE_AFTER_MS) counts as no worker", async () => {
    writeHeartbeat(h.tmp.handle, new Date(h.clock.ms() - 5 * 60_000));
    const { deps } = cliDeps();
    expect(await runSyncCli(["--once", "--job=state"], deps)).toBe(0);
    expect(requestRows()).toEqual([]);
    expect(h.runs().map((r) => r.status)).toEqual(["success"]);
  });

  it("CLI-3: lease held by another holder: no jobs run, no Sleeper call, exit 2 with a clear message", async () => {
    expect(acquireLease(h.tmp.handle, "other-process", LEASE_TTL_MS, h.clock.now())).toBe(true);
    const { deps, out } = cliDeps();
    const code = await runSyncCli(["--once", "--job=all"], deps);
    expect(code).toBe(2);
    expect(out.join("\n")).toContain("another process holds the sync lease");
    expect(sleeperWire).toEqual([]);
    expect(h.runs()).toEqual([]);
    expect(readLease(h.tmp.handle)?.holder).toBe("other-process");
  });

  /** Jobs that burn simulated time without Sleeper calls, so lease timing is the only variable. */
  function timedJobs(ran: string[], during: (name: string) => Promise<void>): Job[] {
    return (["state", "league"] as const).map((name) => ({
      name,
      run: async () => {
        ran.push(name);
        await during(name);
        return { rowsChanged: 1 };
      },
    }));
  }

  it("CLI-4a: a run longer than the lease TTL renews the lease and completes every job", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const start = h.clock.ms();
    const ran: string[] = [];
    let thiefAcquired: boolean | null = null;
    const jobs = timedJobs(ran, async (name) => {
      // 5 simulated minutes per job, in 30 s steps (the renew period), so the 2 minute TTL
      // would have lapsed twice over without renewals.
      for (let i = 0; i < 10; i += 1) {
        h.clock.advance(30_000);
        await vi.advanceTimersByTimeAsync(30_000);
      }
      if (name === "state") {
        thiefAcquired = acquireLease(h.tmp.handle, "thief", LEASE_TTL_MS, h.clock.now());
      }
    });
    const { deps } = cliDeps({ registry: createJobRegistry(jobs) });
    const code = await runSyncCli(["--once", "--job=all"], deps);
    expect(code).toBe(0);
    expect(ran).toEqual(["state", "league"]);
    expect(h.clock.ms() - start).toBeGreaterThan(2 * LEASE_TTL_MS);
    expect(thiefAcquired).toBe(false); // the lease was still ours 5 minutes in
    expect(h.runs().map((r) => r.status)).toEqual(["success", "success"]);
    expect(readLease(h.tmp.handle)).toBeNull(); // released at the end
  });

  it("CLI-4b: if a renewal finds the lease lost, the run stops before the next job and exits 1", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const ran: string[] = [];
    const jobs = timedJobs(ran, async () => {
      // Lapse the lease (no renewal timer fired yet), let another process take it, then let the
      // renewal timer fire.
      h.clock.advance(LEASE_TTL_MS + 1000);
      expect(acquireLease(h.tmp.handle, "thief", LEASE_TTL_MS, h.clock.now())).toBe(true);
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const { deps } = cliDeps({
      registry: createJobRegistry(jobs),
      logger: pino({ level: "silent" }),
    });
    const code = await runSyncCli(["--once", "--job=all"], deps);
    expect(ran).toEqual(["state"]); // "league" never started
    expect(code).toBe(1);
    expect(readLease(h.tmp.handle)?.holder).toBe("thief"); // we did not clobber the new holder
    expect(claimNext(h.tmp.handle, h.clock.now())).toBeNull();
  });
});
