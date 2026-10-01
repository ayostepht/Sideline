/**
 * Polite, cached, throttled fetcher for the fixture recorder. Raw responses are stored ONLY in
 * the gitignored `.spike-cache/` (same key scheme as the T0.3a spike helper, so its cache is reused).
 *
 * Rules enforced here:
 *  - `GET /v1/players/nfl` is never refetched while a cached copy younger than 24 h exists, even
 *    with `refresh`.
 *  - At least `gapMs` (default 1.1 s) between request starts, at most 60 calls per minute.
 *  - 429 and 5xx are retried with backoff (max 3 attempts); other statuses fail the run.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";

export const PLAYERS_MIN_REFETCH_MS = 24 * 60 * 60 * 1000;
export const USER_AGENT = "Sideline-fixture-recorder/0.0.0 (self-hosted)";
export const API_ROOT = "https://api.sleeper.app";

export type CacheDecision = "use-cache" | "fetch";

export function isPlayersEndpoint(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === "/v1/players/nfl";
  } catch {
    return false;
  }
}

/**
 * Whether to serve from cache. `cacheAgeMs` is null when there is no cached copy.
 * Players: any cached copy younger than 24 h is used, regardless of `refresh`.
 */
export function decideCache(
  url: string,
  cacheAgeMs: number | null,
  opts: { refresh: boolean; maxAgeMs: number },
): CacheDecision {
  if (cacheAgeMs === null) return "fetch";
  if (isPlayersEndpoint(url)) return cacheAgeMs < PLAYERS_MIN_REFETCH_MS ? "use-cache" : "fetch";
  if (opts.refresh) return "fetch";
  return cacheAgeMs <= opts.maxAgeMs ? "use-cache" : "fetch";
}

/** Highest number of call starts inside any sliding 60 s window. */
export function maxCallsPerMinute(timesMs: readonly number[]): number {
  const t = [...timesMs].sort((a, b) => a - b);
  let max = 0;
  let lo = 0;
  for (let hi = 0; hi < t.length; hi += 1) {
    while ((t[hi] ?? 0) - (t[lo] ?? 0) >= 60_000) lo += 1;
    max = Math.max(max, hi - lo + 1);
  }
  return max;
}

export function cacheFileFor(cacheDir: string, url: string): string {
  const hash = createHash("sha1").update(`GET ${url}`).digest("hex").slice(0, 16);
  return join(cacheDir, `get-${hash}.json`);
}

interface CachedEntry {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  elapsedMs: number;
  bytes: number;
  rawText: string;
}

export interface FetchedJson {
  status: number;
  body: unknown;
  fromCache: boolean;
  /** When the data was fetched (cache file mtime, or now). */
  fetchedAtMs: number;
}

export interface FetcherOptions {
  cacheDir: string;
  refresh: boolean;
  maxAgeMs: number;
  gapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface Fetcher {
  getJson(url: string): Promise<FetchedJson>;
  readonly calls: { url: string; atMs: number; status: number }[];
}

function redactUrl(url: string): string {
  return url.replace(/\/user\/[^/?]+$/, "/user/<name>").replace(/\/\d{16,}/g, "/<id>");
}

export function createFetcher(options: FetcherOptions): Fetcher {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const gapMs = options.gapMs ?? 1100;
  const doFetch = options.fetchImpl ?? fetch;
  const calls: Fetcher["calls"] = [];
  let lastStart = 0;
  mkdirSync(options.cacheDir, { recursive: true });
  const logFile = join(options.cacheDir, "record-calls.jsonl");

  async function network(url: string): Promise<CachedEntry> {
    for (let attempt = 1; ; attempt += 1) {
      const wait = lastStart + gapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      const started = now();
      const res = await doFetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      calls.push({ url, atMs: started, status: res.status });
      appendFileSync(
        logFile,
        `${JSON.stringify({ t: new Date(started).toISOString(), url: redactUrl(url), status: res.status })}\n`,
      );
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 3) {
        await sleep(2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500));
        continue;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        url,
        method: "GET",
        status: res.status,
        headers,
        elapsedMs: now() - started,
        bytes: buf.length,
        rawText: buf.toString("utf8"),
      };
    }
  }

  return {
    calls,
    async getJson(url: string): Promise<FetchedJson> {
      const file = cacheFileFor(options.cacheDir, url);
      const age = existsSync(file) ? now() - statSync(file).mtimeMs : null;
      let entry: CachedEntry;
      let fromCache = false;
      let fetchedAtMs: number;
      if (
        decideCache(url, age, { refresh: options.refresh, maxAgeMs: options.maxAgeMs }) ===
        "use-cache"
      ) {
        entry = JSON.parse(readFileSync(file, "utf8")) as CachedEntry;
        fromCache = true;
        fetchedAtMs = statSync(file).mtimeMs;
      } else {
        entry = await network(url);
        if (entry.status === 200) writeFileSync(file, JSON.stringify(entry));
        fetchedAtMs = now();
      }
      if (entry.status !== 200) throw new Error(`HTTP ${entry.status} for ${redactUrl(url)}`);
      let body: unknown = null;
      if (entry.rawText.length > 0) body = JSON.parse(entry.rawText) as unknown;
      return { status: entry.status, body, fromCache, fetchedAtMs };
    },
  };
}
