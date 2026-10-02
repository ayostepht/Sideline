import type { z } from "zod";
import {
  SleeperHttpError,
  SleeperNetworkError,
  SleeperSchemaError,
  SleeperTimeoutError,
} from "./errors.js";
import type { EtagStore } from "./etag-store.js";
import type { CallCounter, RateLimiter } from "./rate-limiter.js";

export const DOCUMENTED_BASE_URL = "https://api.sleeper.app/v1";
export const UNDOCUMENTED_BASE_URL = "https://api.sleeper.app";

export type SleeperEvent =
  | { type: "request"; url: string; attempt: number }
  | { type: "retry"; url: string; attempt: number; reason: string; delayMs: number }
  | { type: "response"; url: string; attempt: number; status: number; durationMs: number }
  | { type: "error"; url: string; attempt: number; code: string; message: string };

export interface SleeperHttpOptions {
  limiter: RateLimiter;
  /** Documented API base. Default https://api.sleeper.app/v1. */
  baseUrl?: string;
  /** Undocumented root (projections, stats). Default https://api.sleeper.app. */
  rootUrl?: string;
  fetch?: typeof fetch;
  userAgent?: string;
  etagStore?: EtagStore;
  onEvent?: (event: SleeperEvent) => void;
  /** Per-attempt timeout. Default 10000. */
  timeoutMs?: number;
  /** Retries after the first attempt (429/5xx only). Default 3. */
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  retryAfterCapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Schedules the per-attempt timeout; returns a cancel function. Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => () => void;
  /** Returns [0,1). Injectable for deterministic jitter. */
  random?: () => number;
}

export interface RequestOptions {
  /** Use the undocumented root base instead of /v1. */
  root?: boolean;
  /** Send If-None-Match when a store is configured. Default true. */
  etag?: boolean;
  /** Count this call (and its retries) toward a job's calls_made. */
  counter?: CallCounter;
  /** Aborts the call (and any retry wait) when fired; no request is sent once aborted. */
  signal?: AbortSignal;
}

export interface SleeperResult<T> {
  data: T;
  notModified: boolean;
  status: number;
  attempts: number;
}

const realSetTimer = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

/** Releases the socket for responses whose body we will not read. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // body already consumed or locked; nothing to release
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("request aborted");
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parses Retry-After (delta seconds or HTTP date) into ms, or undefined. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed) * 1000;
  // Anything else numeric-looking (e.g. "-5", "1e3") falls through to Date.parse, which
  // yields a past or garbage date: it clamps to 0 or undefined, both harmless (backoff wins).
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Pure backoff: full jitter over min(max, base * 2^(retry-1)). `retry` starts at 1. */
export function computeBackoff(
  retry: number,
  random: number,
  baseMs = 500,
  maxMs = 30_000,
): number {
  return Math.floor(random * Math.min(maxMs, baseMs * 2 ** (retry - 1)));
}

/**
 * Rate-limited Sleeper client. Every attempt (including retries) acquires the limiter.
 * Retries only on 429 and 5xx. Timeouts and network errors are NOT retried: they fail fast
 * with SleeperTimeoutError / SleeperNetworkError (PLAN T1.2 spec).
 */
export class SleeperHttp {
  private readonly o: Required<Omit<SleeperHttpOptions, "etagStore" | "onEvent" | "userAgent">> &
    Pick<SleeperHttpOptions, "etagStore" | "onEvent" | "userAgent">;

  constructor(options: SleeperHttpOptions) {
    this.o = {
      baseUrl: DOCUMENTED_BASE_URL,
      rootUrl: UNDOCUMENTED_BASE_URL,
      fetch: (...args) => fetch(...args),
      timeoutMs: 10_000,
      maxRetries: 3,
      backoffBaseMs: 500,
      backoffMaxMs: 30_000,
      retryAfterCapMs: 60_000,
      now: Date.now,
      sleep: realSleep,
      setTimer: realSetTimer,
      random: Math.random,
      ...options,
    };
  }

  get limiter(): RateLimiter {
    return this.o.limiter;
  }

  async getJson<S extends z.ZodType>(
    path: string,
    schema: S,
    opts: RequestOptions = {},
  ): Promise<SleeperResult<z.output<S>>> {
    const url = (opts.root ? this.o.rootUrl : this.o.baseUrl) + path;
    const store = opts.etag === false ? undefined : this.o.etagStore;
    const cached = store ? await store.get(url) : undefined;
    const { status, body, etag, attempts } = await this.send(
      url,
      cached?.etag,
      opts.counter,
      opts.signal,
    );

    let raw: unknown;
    let notModified = false;
    if (status === 304) {
      if (!cached) throw new SleeperHttpError(304, url, attempts);
      raw = cached.body;
      notModified = true;
    } else {
      raw = body;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 5).map((i) => ({
        path: i.path.join("."),
        message: i.message.slice(0, 160),
      }));
      throw new SleeperSchemaError(path, issues);
    }
    if (store && !notModified && etag) await store.set(url, etag, raw);
    return { data: parsed.data, notModified, status, attempts };
  }

  private emit(event: SleeperEvent): void {
    this.o.onEvent?.(event);
  }

  private async send(
    url: string,
    ifNoneMatch: string | undefined,
    counter: CallCounter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{ status: number; body: unknown; etag: string | null; attempts: number }> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.o.userAgent) headers["user-agent"] = this.o.userAgent;
    if (ifNoneMatch) headers["if-none-match"] = ifNoneMatch;

    for (let attempt = 1; ; attempt++) {
      throwIfAborted(signal);
      await this.o.limiter.acquire(counter);
      // The limiter may have queued us for a while: re-check so a lost lease sends nothing.
      throwIfAborted(signal);
      this.emit({ type: "request", url, attempt });
      const started = this.o.now();
      const controller = new AbortController();
      let timedOut = false;
      const cancelTimer = this.o.setTimer(() => {
        timedOut = true;
        controller.abort();
      }, this.o.timeoutMs);
      const onAbort = (): void => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      let res: Response;
      let text = "";
      try {
        res = await this.o.fetch(url, { headers, signal: controller.signal });
        if (res.status !== 304 && res.ok) text = await res.text();
      } catch (cause) {
        throwIfAborted(signal);
        const err = timedOut
          ? new SleeperTimeoutError(url, this.o.timeoutMs, attempt)
          : new SleeperNetworkError(url, attempt, cause);
        this.emit({ type: "error", url, attempt, code: err.code, message: err.message });
        throw err;
      } finally {
        cancelTimer();
        signal?.removeEventListener("abort", onAbort);
      }
      const status = res.status;
      this.emit({ type: "response", url, attempt, status, durationMs: this.o.now() - started });

      if (status === 304) await discard(res);
      if (status === 304 || res.ok) {
        let body: unknown = undefined;
        if (status !== 304) {
          try {
            body = JSON.parse(text);
          } catch {
            throw new SleeperSchemaError(new URL(url).pathname, [
              { path: "", message: "response body is not valid JSON" },
            ]);
          }
        }
        return { status, body, etag: res.headers.get("etag"), attempts: attempt };
      }

      await discard(res);
      const retryable = status === 429 || status >= 500;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"), this.o.now());
      const tooLong = retryable && retryAfter !== undefined && retryAfter > this.o.retryAfterCapMs;
      if (!retryable || attempt > this.o.maxRetries || tooLong) {
        // A Retry-After beyond the cap fails now; the next scheduled run retries.
        const err = new SleeperHttpError(status, url, attempt, tooLong ? retryAfter : undefined);
        this.emit({ type: "error", url, attempt, code: err.code, message: err.message });
        throw err;
      }
      const backoff = computeBackoff(
        attempt,
        this.o.random(),
        this.o.backoffBaseMs,
        this.o.backoffMaxMs,
      );
      const delayMs = Math.min(this.o.retryAfterCapMs, Math.max(retryAfter ?? 0, backoff));
      this.emit({ type: "retry", url, attempt, reason: `status ${status}`, delayMs });
      await this.o.sleep(delayMs);
      throwIfAborted(signal);
    }
  }
}

export function createSleeperHttp(options: SleeperHttpOptions): SleeperHttp {
  return new SleeperHttp(options);
}
