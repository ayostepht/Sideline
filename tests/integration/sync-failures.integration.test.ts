import { http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSleeperServer, recordedFixtureRoot } from "../msw/server.js";
import { SLEEPER_BASE_URL, withStatus } from "../msw/sleeper-handlers.js";
import {
  createNflverseMock,
  createSyncHarness,
  type SyncHarness,
} from "../helpers/sync-harness.js";

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let h: SyncHarness;
/** Every Sleeper request path seen on the wire, including ones answered by injected failures. */
const wire: string[] = [];
server.events.on("request:start", ({ request }) => {
  wire.push(new URL(request.url).pathname);
});

beforeAll(() => server.listen());
beforeEach(() => {
  wire.length = 0;
  // Only the timers the Sleeper client uses for backoff and per-attempt timeouts are faked.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  server.use(createNflverseMock().handler);
  h = createSyncHarness();
});
afterEach(() => {
  vi.useRealTimers();
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

const realTick = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Settles `p`, advancing the fake clock by each backoff the client announces. */
async function drive<T>(p: Promise<T>, onRetry?: (delayMs: number) => Promise<void>): Promise<T> {
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  while (!done) {
    await realTick();
    const retry = h.retryQueue.shift();
    if (retry === undefined) continue;
    if (onRetry) await onRetry(retry.delayMs);
    else await vi.advanceTimersByTimeAsync(retry.delayMs);
  }
  return p;
}

describe("T1.7b: failure handling", () => {
  it("SYNC-3a: a persistent 500 fails that job only; the others run and the run is recorded", async () => {
    server.use(withStatus("/v1/league/:id/rosters", 500));
    const outcomes = await drive(h.run());
    const failed = outcomes.filter((o) => o.status === "failed");
    expect(failed.map((o) => o.job)).toEqual(["rosters"]);
    expect(failed[0]?.error).toMatch(/500/);
    expect(outcomes).toHaveLength(11);
    // 1 try + 3 retries, each backoff announced before it was waited
    expect(wire.filter((r) => r.endsWith("/rosters"))).toHaveLength(4);
    const runs = h.runs();
    expect(runs).toHaveLength(11);
    expect(runs.find((r) => r.job === "rosters")).toMatchObject({ status: "failed" });
    expect(runs.find((r) => r.job === "rosters")?.error).toMatch(/500/);
    expect(runs.filter((r) => r.job !== "rosters").every((r) => r.status !== "failed")).toBe(true);
    expect(h.count("rosters")).toBe(0);
    expect(h.count("matchups")).toBe(140);
    expect(h.count("players")).toBe(1021);
  });

  it("SYNC-3b: a 429 with Retry-After is retried only after the delay, then succeeds", async () => {
    server.use(
      withStatus("/v1/league/:id/transactions/:week", 429, 1, { headers: { "Retry-After": "2" } }),
    );
    let retried = "";
    const countCalls = (): number => wire.filter((r) => r === retried).length;
    let callsBeforeWait = -1;
    let callsAfterAlmost = -1;
    let delay = -1;
    const outcomes = await drive(h.run(["state", "league", "transactions"]), async (delayMs) => {
      delay = delayMs;
      retried = wire[wire.length - 1] ?? "";
      callsBeforeWait = countCalls();
      await vi.advanceTimersByTimeAsync(delayMs - 1);
      for (let i = 0; i < 5; i += 1) await realTick();
      callsAfterAlmost = countCalls();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(outcomes.map((o) => o.status)).toEqual(["success", "success", "success"]);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(60_000);
    expect(callsAfterAlmost).toBe(callsBeforeWait); // nothing sent before the delay elapsed
    expect(countCalls()).toBe(callsBeforeWait + 1); // then exactly one retry
    expect(h.count("transactions")).toBeGreaterThan(0);
  });

  it("SYNC-3c: a hanging endpoint is aborted by the client timeout; the job fails, nothing crashes", async () => {
    let hung = 0;
    server.use(
      http.get(`${SLEEPER_BASE_URL}/v1/players/nfl/trending/:type`, async ({ request }) => {
        hung += 1;
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return undefined;
      }),
    );
    const run = h.run(["state", "trending", "league"]);
    let done = false;
    void run.then(() => (done = true));
    while (hung === 0 && !done) await realTick();
    expect(hung).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000); // the client's per-attempt timeout
    const outcomes = await run;
    const byJob = Object.fromEntries(outcomes.map((o) => [o.job, o]));
    expect(byJob["trending"]?.status).toBe("failed");
    expect(byJob["trending"]?.error).toMatch(/time/i);
    expect(byJob["state"]?.status).toBe("success");
    expect(byJob["league"]?.status).toBe("success");
    expect(hung).toBe(1); // timeouts are not retried
    expect(h.runs().find((r) => r.job === "trending")).toMatchObject({ status: "failed" });
  });
});
