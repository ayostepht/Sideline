import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheFileFor,
  createFetcher,
  decideCache,
  isPlayersEndpoint,
  maxCallsPerMinute,
  PLAYERS_MIN_REFETCH_MS,
} from "./fetch-cache.js";

const PLAYERS = "https://api.sleeper.app/v1/players/nfl";
const STATE = "https://api.sleeper.app/v1/state/nfl";
const HOUR = 3_600_000;

describe("decideCache", () => {
  const opts = { refresh: false, maxAgeMs: 2 * HOUR };

  it("recognizes the players endpoint", () => {
    expect(isPlayersEndpoint(PLAYERS)).toBe(true);
    expect(isPlayersEndpoint(`${PLAYERS}?x=1`)).toBe(true);
    expect(isPlayersEndpoint(`${PLAYERS}/trending/add?limit=50`)).toBe(false);
    expect(isPlayersEndpoint("not a url")).toBe(false);
  });

  it("never refetches players while a cached copy is younger than 24 h, even with refresh", () => {
    expect(decideCache(PLAYERS, 23 * HOUR, { refresh: true, maxAgeMs: 0 })).toBe("use-cache");
    expect(decideCache(PLAYERS, 1000, { refresh: true, maxAgeMs: 0 })).toBe("use-cache");
  });

  it("fetches players when the cache is missing or at least 24 h old", () => {
    expect(decideCache(PLAYERS, null, opts)).toBe("fetch");
    expect(decideCache(PLAYERS, PLAYERS_MIN_REFETCH_MS, opts)).toBe("fetch");
    expect(decideCache(PLAYERS, 25 * HOUR, opts)).toBe("fetch");
  });

  it("applies max age and refresh to other endpoints", () => {
    expect(decideCache(STATE, null, opts)).toBe("fetch");
    expect(decideCache(STATE, HOUR, opts)).toBe("use-cache");
    expect(decideCache(STATE, 3 * HOUR, opts)).toBe("fetch");
    expect(decideCache(STATE, HOUR, { ...opts, refresh: true })).toBe("fetch");
    expect(decideCache(STATE, 99 * HOUR, { refresh: false, maxAgeMs: Infinity })).toBe("use-cache");
  });
});

describe("maxCallsPerMinute", () => {
  it("counts the busiest sliding 60 s window", () => {
    expect(maxCallsPerMinute([])).toBe(0);
    expect(maxCallsPerMinute([0, 1100, 2200])).toBe(3);
    const spaced = Array.from({ length: 100 }, (_, i) => i * 1100);
    expect(maxCallsPerMinute(spaced)).toBeLessThanOrEqual(55);
  });
});

describe("createFetcher", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fetch-cache-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seed(url: string, ageMs: number): void {
    const file = cacheFileFor(dir, url);
    writeFileSync(
      file,
      JSON.stringify({
        url,
        method: "GET",
        status: 200,
        headers: {},
        elapsedMs: 1,
        bytes: 2,
        rawText: '{"cached":true}',
      }),
    );
    const t = (Date.now() - ageMs) / 1000;
    utimesSync(file, t, t);
  }

  function fakeFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
    return vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"fresh":true}', { status: 200 })),
    );
  }

  it("reuses a fresh players cache with refresh on and makes no network call", async () => {
    seed(PLAYERS, 2 * HOUR);
    const fetchImpl = fakeFetch();
    const f = createFetcher({
      cacheDir: dir,
      refresh: true,
      maxAgeMs: 0,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });
    const res = await f.getJson(PLAYERS);
    expect(res.fromCache).toBe(true);
    expect(res.body).toEqual({ cached: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });

  it("fetches players once when the cache is older than 24 h, then caches it", async () => {
    seed(PLAYERS, 30 * HOUR);
    const fetchImpl = fakeFetch();
    const f = createFetcher({
      cacheDir: dir,
      refresh: false,
      maxAgeMs: 0,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });
    expect((await f.getJson(PLAYERS)).body).toEqual({ fresh: true });
    expect((await f.getJson(PLAYERS)).fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches other endpoints on refresh and sends a descriptive User-Agent", async () => {
    seed(STATE, 1000);
    const fetchImpl = fakeFetch();
    const f = createFetcher({
      cacheDir: dir,
      refresh: true,
      maxAgeMs: 2 * HOUR,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });
    await f.getJson(STATE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.stringify(init?.headers)).toContain("Sideline-fixture-recorder");
  });

  it("spaces calls at least gapMs apart", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const fetchImpl = fakeFetch();
    const f = createFetcher({
      cacheDir: dir,
      refresh: true,
      maxAgeMs: 0,
      gapMs: 1100,
      fetchImpl,
      now: () => clock,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    });
    await f.getJson(`${STATE}?a=1`);
    await f.getJson(`${STATE}?a=2`);
    expect(sleeps.some((s) => s >= 1100 - 1)).toBe(true);
    const [first, second] = f.calls;
    expect((second?.atMs ?? 0) - (first?.atMs ?? 0)).toBeGreaterThanOrEqual(1100);
  });

  it("retries 5xx and fails on other non-200 statuses", async () => {
    const statuses = [503, 200];
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("{}", { status: statuses.shift() ?? 200 })),
    );
    const f = createFetcher({
      cacheDir: dir,
      refresh: true,
      maxAgeMs: 0,
      fetchImpl,
      sleep: () => Promise.resolve(),
    });
    await expect(f.getJson(`${STATE}?r=1`)).resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const notFound = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("null", { status: 404 })),
    );
    const g = createFetcher({
      cacheDir: dir,
      refresh: true,
      maxAgeMs: 0,
      fetchImpl: notFound,
      sleep: () => Promise.resolve(),
    });
    await expect(g.getJson(`${STATE}?r=2`)).rejects.toThrow("HTTP 404");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
