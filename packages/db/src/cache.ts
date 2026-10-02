/** ETag store, computed-result cache and small read helpers. Callers pass `now`. */
import type { DbHandle } from "./connection.js";

// ---------- ETag store (structurally matches the Sleeper client's EtagStore) ----------

export interface DbEtagEntry {
  etag: string;
  body: unknown;
}
export interface DbEtagStore {
  get(url: string): Promise<DbEtagEntry | undefined>;
  set(url: string, etag: string, body: unknown): Promise<void>;
}

/** Body is stored as JSON text. `now` defaults to the wall clock (injectable for tests). */
export function createDbEtagStore(h: DbHandle, now: () => Date = () => new Date()): DbEtagStore {
  const sel = h.sqlite.prepare("SELECT etag, body FROM http_cache WHERE url = ?");
  const up = h.sqlite.prepare(
    `INSERT INTO http_cache (url, etag, body, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (url) DO UPDATE SET etag = excluded.etag, body = excluded.body,
       fetched_at = excluded.fetched_at`,
  );
  return {
    get(url) {
      const row = sel.get(url) as { etag: string | null; body: string } | undefined;
      if (row === undefined || row.etag === null) return Promise.resolve(undefined);
      try {
        return Promise.resolve({ etag: row.etag, body: JSON.parse(row.body) as unknown });
      } catch {
        return Promise.resolve(undefined);
      }
    },
    set(url, etag, body) {
      up.run(url, etag, JSON.stringify(body), now().toISOString());
      return Promise.resolve();
    },
  };
}

// ---------- computed_cache ----------

export interface ComputedKey {
  leagueId: string;
  week: number;
  kind: string;
  inputsHash: string;
}

/** Cached payload (parsed JSON, validate with zod at the caller) or null on a miss. */
export function getComputed(h: DbHandle, key: ComputedKey): unknown {
  const row = h.sqlite
    .prepare(
      `SELECT payload_json AS p FROM computed_cache
       WHERE league_id = ? AND week = ? AND kind = ? AND inputs_hash = ?`,
    )
    .get(key.leagueId, key.week, key.kind, key.inputsHash) as { p: string } | undefined;
  if (row === undefined) return null;
  try {
    return JSON.parse(row.p) as unknown;
  } catch {
    return null;
  }
}

export function putComputed(h: DbHandle, key: ComputedKey, payload: unknown, now: Date): void {
  h.sqlite
    .prepare(
      `INSERT INTO computed_cache (league_id, week, kind, inputs_hash, payload_json, computed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (league_id, week, kind, inputs_hash) DO UPDATE SET
         payload_json = excluded.payload_json, computed_at = excluded.computed_at`,
    )
    .run(
      key.leagueId,
      key.week,
      key.kind,
      key.inputsHash,
      JSON.stringify(payload),
      now.toISOString(),
    );
}

/** Deletes cached results for a league (optionally one week). Returns the deleted count. */
export function invalidateComputed(
  h: DbHandle,
  scope: { leagueId: string; week?: number },
): number {
  if (scope.week === undefined) {
    return h.sqlite.prepare("DELETE FROM computed_cache WHERE league_id = ?").run(scope.leagueId)
      .changes;
  }
  return h.sqlite
    .prepare("DELETE FROM computed_cache WHERE league_id = ? AND week = ?")
    .run(scope.leagueId, scope.week).changes;
}

// ---------- read helpers ----------

/** Row count per user table (excludes sqlite_* and drizzle bookkeeping). */
export function tableCounts(h: DbHandle): Record<string, number> {
  const names = h.sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\' ORDER BY name`,
    )
    .all() as { name: string }[];
  const out: Record<string, number> = {};
  for (const { name } of names) {
    const r = h.sqlite
      .prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`)
      .get() as {
      n: number;
    };
    out[name] = r.n;
  }
  return out;
}

/** `{ ok: true }` or `{ ok: false, error }`; never throws. */
export function dbCheck(h: DbHandle): { ok: true } | { ok: false; error: string } {
  try {
    h.sqlite.prepare("SELECT 1").get();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
