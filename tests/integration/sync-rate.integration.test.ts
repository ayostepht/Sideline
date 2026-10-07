import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LeaseKeeper } from "../../apps/worker/src/lease.js";
import { Worker } from "../../apps/worker/src/worker.js";
import { createSleeperServer, recordedFixtureRoot } from "../msw/server.js";
import {
  createNflverseMock,
  createOpenMeteoMock,
  createSyncHarness,
  type SyncHarness,
} from "../helpers/sync-harness.js";

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let h: SyncHarness;
/** Request timestamps from the fake clock (ms), one entry per request on the wire. */
let stamps: { at: number; path: string }[] = [];
server.events.on("request:start", ({ request }) => {
  const url = new URL(request.url);
  if (h !== undefined && url.hostname === "api.sleeper.app") {
    stamps.push({ at: h.clock.ms(), path: url.pathname });
  }
});

beforeAll(() => server.listen());
beforeEach(() => {
  stamps = [];
  server.use(createNflverseMock().handler, createOpenMeteoMock().handler);
  h = createSyncHarness();
});
afterEach(() => {
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

const MIN = 60_000;

describe("T1.7b: Sleeper call rate (CLAUDE.md section 8)", () => {
  it("RATE-1: 60 simulated game-window minutes stay within 300 per sliding 60 s, 60 per minute on average, one /players/nfl", async () => {
    // Sunday 13:00 ET (17:00 UTC): inside the fallback game window, so the fastest cadences apply
    // (rosters every 5 min, matchups every 2 min). The kickoff is also passed in explicitly.
    const start = "2026-10-04T17:00:00.000Z";
    h.clock.set(start);
    const lease = new LeaseKeeper(h.tmp.handle, "rate-test-holder", () => h.clock.now());
    const worker = new Worker({
      db: h.tmp.handle,
      config: h.config,
      registry: h.registry,
      limiter: h.limiter,
      logger: h.logger,
      lease,
      now: () => h.clock.now(),
      loadGames: () => [{ kickoffUtc: start }],
    });
    expect(worker.acquireTick()).toBe(true);
    for (let minute = 0; minute < 60; minute += 1) {
      await worker.scheduleTick();
      h.clock.advance(MIN);
      expect(worker.renewTick()).toBe(true);
    }
    lease.release();

    const total = stamps.length;
    const firstMinuteCalls = stamps.filter((s) => s.at < Date.parse(start) + MIN).length;
    expect(total).toBeGreaterThan(firstMinuteCalls); // the schedule really kept firing
    expect(stamps.filter((s) => s.path.endsWith("/matchups/4")).length).toBeGreaterThanOrEqual(20);

    // No rolling 60 s window above 300.
    let lo = 0;
    let worst = 0;
    for (let i = 0; i < stamps.length; i += 1) {
      const at = (stamps[i] as { at: number }).at;
      while (at - (stamps[lo] as { at: number }).at >= MIN) lo += 1;
      worst = Math.max(worst, i - lo + 1);
    }
    expect(worst).toBeLessThanOrEqual(300);
    expect(total / 60).toBeLessThanOrEqual(60);
    expect(stamps.filter((s) => s.path === "/v1/players/nfl")).toHaveLength(1);
    expect(h.limiter.totalCalls).toBe(total); // every wire request went through the shared limiter
  });
});
