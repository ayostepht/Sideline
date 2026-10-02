import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  computeBackoff,
  createSleeperHttp,
  parseRetryAfter,
  type SleeperEvent,
  type SleeperHttpOptions,
} from "./client.js";
import { InMemoryEtagStore } from "./etag-store.js";
import {
  SleeperHttpError,
  SleeperNetworkError,
  SleeperSchemaError,
  SleeperTimeoutError,
} from "./errors.js";
import { createCallCounter, RateLimiter } from "./rate-limiter.js";

const BASE = "https://api.sleeper.app/v1";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const schema = z.object({ ok: z.boolean() }).passthrough();

function setup(extra: Partial<SleeperHttpOptions> = {}) {
  let t = 5_000_000;
  const sleeps: number[] = [];
  const sleep = (ms: number) => {
    sleeps.push(ms);
    t += ms;
    return Promise.resolve();
  };
  const now = () => t;
  const limiter = new RateLimiter({ ratePerSecond: 1000, now, sleep });
  const events: SleeperEvent[] = [];
  const client = createSleeperHttp({
    limiter,
    now,
    sleep,
    random: () => 0.5,
    onEvent: (e) => events.push(e),
    userAgent: "Sideline/test",
    ...extra,
  });
  return { client, limiter, sleeps, events };
}

function sequence(statuses: Array<number | [number, Record<string, string>]>) {
  let i = 0;
  const seen: Request[] = [];
  server.use(
    http.get(`${BASE}/x`, ({ request }) => {
      seen.push(request.clone());
      const s = statuses[Math.min(i++, statuses.length - 1)] ?? 200;
      const [status, headers] = Array.isArray(s) ? s : [s, {}];
      return status === 200
        ? HttpResponse.json({ ok: true }, { headers })
        : new HttpResponse(null, { status, headers });
    }),
  );
  return seen;
}

describe("SleeperHttp retries (T1.2 spec)", () => {
  it("500,500,200 succeeds with attempts 3 and 3 limiter calls", async () => {
    sequence([500, 500, 200]);
    const { client, limiter, sleeps, events } = setup();
    const counter = createCallCounter();
    const r = await client.getJson("/x", schema, { counter });
    expect(r).toMatchObject({ data: { ok: true }, attempts: 3, status: 200, notModified: false });
    expect(limiter.totalCalls).toBe(3);
    expect(counter.calls).toBe(3);
    expect(sleeps).toEqual([250, 500]);
    expect(events.filter((e) => e.type === "retry")).toHaveLength(2);
    expect(events.filter((e) => e.type === "request")).toHaveLength(3);
  });

  it("429 with Retry-After: 2 waits at least 2000 ms", async () => {
    sequence([[429, { "retry-after": "2" }], 200]);
    const { client, sleeps } = setup();
    await client.getJson("/x", schema);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
  });

  it("404 is not retried", async () => {
    sequence([404]);
    const { client, limiter } = setup();
    const err = await client.getJson("/x", schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperHttpError);
    expect((err as SleeperHttpError).status).toBe(404);
    expect(limiter.totalCalls).toBe(1);
  });

  it("503 x4 throws after 3 retries (4 attempts)", async () => {
    sequence([503]);
    const { client, limiter, events } = setup();
    const err = await client.getJson("/x", schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperHttpError);
    expect((err as SleeperHttpError).attempts).toBe(4);
    expect(limiter.totalCalls).toBe(4);
    expect(events.at(-1)?.type).toBe("error");
  });

  it("Retry-After over the cap fails immediately without retrying", async () => {
    sequence([[429, { "retry-after": "120" }], 200]);
    const { client, sleeps, limiter } = setup();
    const err = await client.getJson("/x", schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperHttpError);
    expect((err as SleeperHttpError).status).toBe(429);
    expect((err as SleeperHttpError).retryAfterMs).toBe(120_000);
    expect((err as SleeperHttpError).message).toContain("Retry-After 120000");
    expect(sleeps).toEqual([]);
    expect(limiter.totalCalls).toBe(1);
  });

  it("Retry-After exactly at the cap still retries", async () => {
    sequence([[503, { "retry-after": "60" }], 200]);
    const { client, sleeps } = setup();
    await client.getJson("/x", schema);
    expect(sleeps[0]).toBe(60_000);
  });

  it("jitter is deterministic with injected random", async () => {
    sequence([500, 500, 500, 200]);
    const a = setup({ random: () => 1 });
    await a.client.getJson("/x", schema);
    expect(a.sleeps).toEqual([500, 1000, 2000]);
    sequence([500, 500, 500, 200]);
    const b = setup({ random: () => 0 });
    await b.client.getJson("/x", schema);
    expect(b.sleeps).toEqual([0, 0, 0]);
  });

  it("computeBackoff caps at max and parseRetryAfter handles dates", () => {
    expect(computeBackoff(20, 1)).toBe(30_000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
    expect(parseRetryAfter("garbage", 0)).toBeUndefined();
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:05 GMT", 1000)).toBe(4000);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT", 1000)).toBe(0);
  });
});

describe("SleeperHttp errors and validation", () => {
  it("sends User-Agent and fetches the root base when asked", async () => {
    let ua: string | null = null;
    server.use(
      http.get("https://api.sleeper.app/projections/nfl/2026/1", ({ request }) => {
        ua = request.headers.get("user-agent");
        return HttpResponse.json({ ok: true });
      }),
    );
    const { client } = setup();
    await client.getJson("/projections/nfl/2026/1", schema, { root: true });
    expect(ua).toBe("Sideline/test");
  });

  it("timeout throws SleeperTimeoutError and is not retried", async () => {
    let calls = 0;
    const hanging: typeof fetch = (_url, init) => {
      calls++;
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () =>
          rej(new DOMException("aborted", "AbortError")),
        );
      });
    };
    let fire: (() => void) | undefined;
    let cancelled = false;
    const setTimer = (fn: () => void, ms: number) => {
      expect(ms).toBe(20);
      fire = fn;
      return () => {
        cancelled = true;
      };
    };
    const { client, limiter } = setup({ fetch: hanging, timeoutMs: 20, setTimer });
    const pending = client.getJson("/x", schema).catch((e: unknown) => e);
    await vi.waitFor(() => expect(fire).toBeDefined());
    fire?.();
    const err = await pending;
    expect(cancelled).toBe(true);
    expect(err).toBeInstanceOf(SleeperTimeoutError);
    expect(calls).toBe(1);
    expect(limiter.totalCalls).toBe(1);
  });

  it("network errors fail fast as SleeperNetworkError", async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError("boom"));
    const { client } = setup({ fetch: failing });
    const err = await client.getJson("/x", schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperNetworkError);
  });

  it("schema failure throws SleeperSchemaError with path and issues", async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({ ok: "nope" })));
    const { client } = setup();
    const err = await client.getJson("/x", schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SleeperSchemaError);
    const e = err as SleeperSchemaError;
    expect(e.path).toBe("/x");
    expect(e.issues[0]?.path).toBe("ok");
    expect(e.message).toContain("/x");
  });

  it("non-JSON body throws SleeperSchemaError", async () => {
    server.use(http.get(`${BASE}/x`, () => new HttpResponse("<html>", { status: 200 })));
    const { client } = setup();
    await expect(client.getJson("/x", schema)).rejects.toBeInstanceOf(SleeperSchemaError);
  });

  it("tolerates unknown extra fields", async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({ ok: true, extra: 1 })));
    const { client } = setup();
    const r = await client.getJson("/x", schema);
    expect(r.data).toMatchObject({ extra: 1 });
  });
});

describe("SleeperHttp ETag (ADR-002 item 9)", () => {
  function etagHandler(seen: Array<string | null>) {
    server.use(
      http.get(`${BASE}/x`, ({ request }) => {
        const inm = request.headers.get("if-none-match");
        seen.push(inm);
        if (inm === '"v1"') return new HttpResponse(null, { status: 304 });
        return HttpResponse.json({ ok: true, n: 1 }, { headers: { etag: '"v1"' } });
      }),
    );
  }

  it("stores ETag, then sends If-None-Match and returns stored body on 304", async () => {
    const seen: Array<string | null> = [];
    etagHandler(seen);
    const { client } = setup({ etagStore: new InMemoryEtagStore() });
    const first = await client.getJson("/x", schema);
    expect(first.notModified).toBe(false);
    const second = await client.getJson("/x", schema);
    expect(seen).toEqual([null, '"v1"']);
    expect(second).toMatchObject({ notModified: true, status: 304, data: { ok: true, n: 1 } });
  });

  it("opt-out sends no header", async () => {
    const seen: Array<string | null> = [];
    etagHandler(seen);
    const { client } = setup({ etagStore: new InMemoryEtagStore() });
    await client.getJson("/x", schema);
    await client.getJson("/x", schema, { etag: false });
    expect(seen).toEqual([null, null]);
  });

  it("304 with no stored entry is an error", async () => {
    server.use(http.get(`${BASE}/x`, () => new HttpResponse(null, { status: 304 })));
    const { client } = setup();
    await expect(client.getJson("/x", schema)).rejects.toBeInstanceOf(SleeperHttpError);
  });
});

describe("SleeperHttp body release (m2)", () => {
  function fakeRes(status: number, headers: Record<string, string> = {}) {
    const cancel = vi.fn(() => Promise.resolve());
    const res = {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(headers),
      body: { cancel },
      text: () => Promise.resolve("{}"),
    } as unknown as Response;
    return { res, cancel };
  }

  it("cancels the body on 304", async () => {
    const { res, cancel } = fakeRes(304);
    const store = new InMemoryEtagStore();
    await store.set(`${BASE}/x`, '"v1"', { ok: true });
    const { client } = setup({ fetch: () => Promise.resolve(res), etagStore: store });
    await client.getJson("/x", schema);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the body on a 404 and on each retried 503", async () => {
    const a = fakeRes(404);
    await expect(
      setup({ fetch: () => Promise.resolve(a.res) }).client.getJson("/x", schema),
    ).rejects.toBeInstanceOf(SleeperHttpError);
    expect(a.cancel).toHaveBeenCalledTimes(1);

    const b = fakeRes(503);
    await expect(
      setup({ fetch: () => Promise.resolve(b.res) }).client.getJson("/x", schema),
    ).rejects.toBeInstanceOf(SleeperHttpError);
    expect(b.cancel).toHaveBeenCalledTimes(4);
  });

  it("swallows a cancel() that throws", async () => {
    const { res, cancel } = fakeRes(404);
    cancel.mockRejectedValue(new TypeError("locked"));
    await expect(
      setup({ fetch: () => Promise.resolve(res) }).client.getJson("/x", schema),
    ).rejects.toBeInstanceOf(SleeperHttpError);
  });
});

describe("SleeperHttp defaults", () => {
  it("constructs with default fetch, clock and sleep", async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({ ok: true })));
    const client = createSleeperHttp({ limiter: new RateLimiter() });
    expect((await client.getJson("/x", schema)).attempts).toBe(1);
    expect(client.limiter.totalCalls).toBe(1);
  });
});

describe("T1.5b abort signal", () => {
  it("sends nothing when the signal is already aborted", async () => {
    let hits = 0;
    server.use(
      http.get(`${BASE}/x`, () => {
        hits += 1;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { client } = setup();
    const ac = new AbortController();
    ac.abort(new Error("lease lost"));
    await expect(client.getJson("/x", schema, { signal: ac.signal })).rejects.toThrow("lease lost");
    expect(hits).toBe(0);
  });

  it("aborts an in-flight request with the signal reason and does not retry", async () => {
    let hits = 0;
    const ac = new AbortController();
    server.use(
      http.get(`${BASE}/slow`, async () => {
        hits += 1;
        ac.abort(new Error("lease lost"));
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ ok: true });
      }),
    );
    const { client } = setup();
    await expect(client.getJson("/slow", schema, { signal: ac.signal })).rejects.toThrow(
      "lease lost",
    );
    expect(hits).toBe(1);
  });
});
