import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface AssetMeta {
  etag: string | null;
  lastModified: string | null;
  downloadedAt: string;
  size: number;
}

export type AssetResult =
  | { ok: true; text: string; meta: AssetMeta; fromCache: boolean; warnings: string[] }
  | { ok: false; reason: "network" | "not_found" | "parse"; message: string };

export interface AssetCacheOptions {
  dir: string;
  fetch: FetchFn;
  now: () => Date;
  maxAgeMs: number;
  timeoutMs?: number;
}

const USER_AGENT = "Sideline (self-hosted)";

async function readCache(
  dir: string,
  asset: string,
): Promise<{ gz: Buffer; meta: AssetMeta } | null> {
  try {
    const gz = await readFile(join(dir, asset));
    const meta = JSON.parse(await readFile(join(dir, `${asset}.meta.json`), "utf8")) as AssetMeta;
    if (typeof meta.downloadedAt !== "string") return null;
    return { gz, meta };
  } catch {
    return null;
  }
}

async function writeAtomic(path: string, data: Buffer | string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

function cached(c: { gz: Buffer; meta: AssetMeta }, warnings: string[]): AssetResult {
  try {
    return {
      ok: true,
      text: gunzipSync(c.gz).toString("utf8"),
      meta: c.meta,
      fromCache: true,
      warnings,
    };
  } catch {
    return { ok: false, reason: "parse", message: "cached asset is not valid gzip" };
  }
}

/**
 * Fetches a .csv.gz asset with an on-disk cache: at most one refresh per maxAgeMs, conditional GET,
 * atomic writes, and stale-if-error. The previous cache is never replaced by a bad download.
 */
export async function loadAsset(
  opts: AssetCacheOptions,
  asset: string,
  url: string,
): Promise<AssetResult> {
  const { dir, now } = opts;
  await mkdir(dir, { recursive: true });
  const prev = await readCache(dir, asset);
  const nowMs = now().getTime();
  if (prev && nowMs - Date.parse(prev.meta.downloadedAt) < opts.maxAgeMs) return cached(prev, []);

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (prev?.meta.etag) headers["If-None-Match"] = prev.meta.etag;
  if (prev?.meta.lastModified) headers["If-Modified-Since"] = prev.meta.lastModified;

  const fail = (reason: "network" | "not_found", message: string): AssetResult => {
    if (!prev) return { ok: false, reason, message };
    return cached(prev, [`nflverse ${asset}: refresh failed (${message}); serving cached copy`]);
  };

  let res: Response;
  try {
    res = await opts.fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
  } catch (e) {
    return fail("network", e instanceof Error ? e.message : String(e));
  }
  if (res.status === 304 && prev) {
    const meta = { ...prev.meta, downloadedAt: now().toISOString() };
    await writeAtomic(join(dir, `${asset}.meta.json`), JSON.stringify(meta));
    return cached({ gz: prev.gz, meta }, []);
  }
  if (res.status === 404 && !prev)
    return { ok: false, reason: "not_found", message: `${asset}: 404` };
  if (!res.ok) return fail("network", `${asset}: HTTP ${res.status}`);

  let gz: Buffer;
  let text: string;
  try {
    gz = Buffer.from(await res.arrayBuffer());
    if (gz.length === 0) throw new Error("empty body");
    text = gunzipSync(gz).toString("utf8");
    if (text.trim() === "") throw new Error("empty content");
  } catch (e) {
    return fail("network", `bad download: ${e instanceof Error ? e.message : String(e)}`);
  }
  const meta: AssetMeta = {
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    downloadedAt: now().toISOString(),
    size: gz.length,
  };
  await writeAtomic(join(dir, asset), gz);
  await writeAtomic(join(dir, `${asset}.meta.json`), JSON.stringify(meta));
  return { ok: true, text, meta, fromCache: false, warnings: [] };
}
