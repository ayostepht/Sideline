import { describe, expect, it } from "vitest";
import { createCallCounter, RateLimiter } from "./rate-limiter.js";

function fake() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: (ms: number) => {
      sleeps.push(ms);
      t += ms;
      return Promise.resolve();
    },
    sleeps,
    advance: (ms: number) => {
      t += ms;
    },
    start: t,
  };
}

describe("RateLimiter", () => {
  it("PLAN 3.1: 20 immediate acquires take about 3 s (burst 5 then 5/s)", async () => {
    const c = fake();
    const l = new RateLimiter({ now: c.now, sleep: c.sleep });
    for (let i = 0; i < 20; i++) await l.acquire();
    const elapsed = c.now() - c.start;
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThanOrEqual(3200);
    expect(l.totalCalls).toBe(20);
  });

  it("PLAN 3.1: hard cap 300 per rolling minute even at 50/s", async () => {
    const c = fake();
    const l = new RateLimiter({ ratePerSecond: 50, now: c.now, sleep: c.sleep });
    const stamps: number[] = [];
    while (c.now() - c.start < 120_000) {
      await l.acquire();
      stamps.push(c.now());
    }
    for (let i = 0; i < stamps.length; i++) {
      const s = stamps[i] ?? 0;
      const inWindow = stamps.filter((x) => x >= s && x < s + 60_000).length;
      expect(inWindow).toBeLessThanOrEqual(300);
    }
    expect(stamps.length).toBeGreaterThan(300);
  });

  it("serves callers in FIFO order", async () => {
    const c = fake();
    const l = new RateLimiter({ ratePerSecond: 1, now: c.now, sleep: c.sleep });
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        l.acquire().then(() => {
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("counts calls per scoped counter and via snapshot", async () => {
    const c = fake();
    const l = new RateLimiter({ now: c.now, sleep: c.sleep });
    const a = createCallCounter();
    await l.acquire(a);
    await l.acquire(a);
    await l.acquire();
    expect(a.calls).toBe(2);
    expect(l.snapshot()).toBe(3);
  });

  it("refills tokens as time passes", async () => {
    const c = fake();
    const l = new RateLimiter({ now: c.now, sleep: c.sleep });
    for (let i = 0; i < 5; i++) await l.acquire();
    c.advance(1000);
    for (let i = 0; i < 5; i++) await l.acquire();
    expect(c.sleeps).toEqual([]);
  });

  it("validates options", () => {
    expect(() => new RateLimiter({ ratePerSecond: 0 })).toThrow(RangeError);
    expect(() => new RateLimiter({ maxPerWindow: -1 })).toThrow(RangeError);
    expect(() => new RateLimiter({ windowMs: Number.NaN })).toThrow(RangeError);
  });

  it("works with real defaults for the first burst", async () => {
    const l = new RateLimiter();
    await l.acquire();
    expect(l.totalCalls).toBe(1);
  });
});
