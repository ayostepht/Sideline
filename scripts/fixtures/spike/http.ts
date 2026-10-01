/**
 * Throwaway spike helper: polite, cached, call-counting fetcher for the Sleeper API.
 * Raw responses are written ONLY to .spike-cache/ (gitignored).
 * Not the production client (that is T1.2).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const CACHE_DIR = join(process.cwd(), ".spike-cache");
const CALL_LOG = join(CACHE_DIR, "calls.jsonl");
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "Sideline-spike/0.0.0 (self-hosted; contact: owner)";

mkdirSync(CACHE_DIR, { recursive: true });

let lastCallAt = 0;

function cacheKey(method: string, url: string): string {
  const hash = createHash("sha1").update(`${method} ${url}`).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `${method.toLowerCase()}-${hash}.json`);
}

export interface SpikeResponse {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  elapsedMs: number;
  bytes: number;
  fromCache: boolean;
  /** Parsed JSON body, or null when the body is empty or not JSON. */
  body: unknown;
  rawText: string;
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

function parseBody(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Count of real (non-cache) network calls recorded so far. */
export function callCount(): number {
  if (!existsSync(CALL_LOG)) return 0;
  return readFileSync(CALL_LOG, "utf8").split("\n").filter(Boolean).length;
}

export async function spikeFetch(
  url: string,
  opts: { method?: "GET" | "HEAD"; refresh?: boolean; headers?: Record<string, string> } = {},
): Promise<SpikeResponse> {
  const method = opts.method ?? "GET";
  const extra = opts.headers ? JSON.stringify(opts.headers) : "";
  const file = cacheKey(method, url + extra);
  if (!opts.refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as CachedEntry;
    return { ...cached, fromCache: true, body: parseBody(cached.rawText) };
  }

  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const elapsedMs = Date.now() - started;
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const rawText = buf.toString("utf8");
  const entry: CachedEntry = {
    url,
    method,
    status: res.status,
    headers,
    elapsedMs,
    bytes: buf.length,
    rawText,
  };
  writeFileSync(file, JSON.stringify(entry));
  appendFileSync(
    CALL_LOG,
    `${JSON.stringify({ t: new Date().toISOString(), method, url: redact(url), status: res.status })}\n`,
  );
  return { ...entry, fromCache: false, body: parseBody(rawText) };
}

/** Call log keeps path shapes only; strip anything that looks like a username. */
function redact(url: string): string {
  return url.replace(/\/user\/[^/?]+$/, "/user/<name>");
}

export function loadEnv(): { username: string; leagueId: string } {
  const text = readFileSync(join(process.cwd(), ".env"), "utf8");
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] !== undefined && m[2] !== undefined) map.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  const username = map.get("SLEEPER_USERNAME");
  const leagueId = map.get("DEFAULT_LEAGUE_ID");
  if (!username || !leagueId)
    throw new Error("SLEEPER_USERNAME and DEFAULT_LEAGUE_ID must be set in .env");
  return { username, leagueId };
}

export const API = "https://api.sleeper.app/v1";
export const API_ROOT = "https://api.sleeper.app";
