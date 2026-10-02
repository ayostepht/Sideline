export interface Clock {
  now(): number;
}

/** Counts calls for one job (calls_made in sync_runs). Pass it per request. */
export interface CallCounter {
  calls: number;
}
export function createCallCounter(): CallCounter {
  return { calls: 0 };
}

export interface RateLimiterOptions {
  /** Sustained requests per second (also the burst capacity). Default 5. */
  ratePerSecond?: number;
  /** Hard cap on requests in any rolling window. Default 300. */
  maxPerWindow?: number;
  /** Rolling window length in ms. Default 60000. */
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Monotonic by default; a wall-clock step cannot move it backward. */
const monotonicNow = (): number => performance.now();

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Token bucket (burst = rate) plus an independent rolling-window hard cap.
 * Callers are served strictly FIFO. Every Sleeper call must `acquire()` first.
 */
export class RateLimiter {
  private readonly rate: number;
  private readonly cap: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tokens: number;
  private lastRefill: number;
  private readonly stamps: number[] = [];
  private tail: Promise<void> = Promise.resolve();
  private total = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.rate = options.ratePerSecond ?? 5;
    this.cap = options.maxPerWindow ?? 300;
    this.windowMs = options.windowMs ?? 60_000;
    for (const [name, v] of [
      ["ratePerSecond", this.rate],
      ["maxPerWindow", this.cap],
      ["windowMs", this.windowMs],
    ] as const) {
      if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive number`);
    }
    if (this.cap < 1) throw new RangeError("maxPerWindow must be at least 1");
    this.now = options.now ?? monotonicNow;
    this.sleep = options.sleep ?? realSleep;
    this.tokens = Math.max(1, this.rate);
    this.lastRefill = this.now();
  }

  /** Total calls granted since construction. */
  get totalCalls(): number {
    return this.total;
  }

  /** Snapshot of total calls; subtract two snapshots to count a span. */
  snapshot(): number {
    return this.total;
  }

  /** Waits until a request may be sent. Resolves in call order. */
  acquire(counter?: CallCounter): Promise<void> {
    const run = this.tail.then(() => this.take(counter));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async take(counter?: CallCounter): Promise<void> {
    for (;;) {
      const t = this.now();
      const burst = Math.max(1, this.rate);
      if (t < this.lastRefill) {
        // Injected clock stepped backward: rebase history so waits stay bounded.
        const delta = t - this.lastRefill;
        for (let i = 0; i < this.stamps.length; i++) this.stamps[i] = (this.stamps[i] ?? 0) + delta;
      }
      const elapsed = Math.max(0, t - this.lastRefill);
      this.tokens = Math.min(burst, this.tokens + (elapsed / 1000) * this.rate);
      this.lastRefill = t;
      while (this.stamps.length > 0 && t - (this.stamps[0] ?? t) >= this.windowMs) {
        this.stamps.shift();
      }
      const tokenWait = this.tokens >= 1 ? 0 : ((1 - this.tokens) / this.rate) * 1000;
      const oldest = this.stamps[0];
      const windowWait =
        this.stamps.length >= this.cap && oldest !== undefined ? oldest + this.windowMs - t : 0;
      const wait = Math.max(tokenWait, windowWait);
      if (wait <= 0) {
        this.tokens -= 1;
        this.stamps.push(t);
        this.total += 1;
        if (counter) counter.calls += 1;
        return;
      }
      await this.sleep(Math.ceil(wait));
    }
  }
}
