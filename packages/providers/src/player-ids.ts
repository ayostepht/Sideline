import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { type FetchFn, loadAsset } from "./cache.js";
import { parseCsvTable } from "./csv.js";
import type { ProviderResult } from "./types.js";

export const PLAYER_IDS_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

export interface PlayerIdsOptions {
  dataDir: string;
  fetch?: FetchFn;
  now: () => Date;
  maxAgeMs?: number;
  timeoutMs?: number;
  url?: string;
}

const ASSET = "db_playerids.csv.gz";
const ID = z.string().regex(/^\d+$/);
const Row = z.object({ sleeper_id: z.string(), espn_id: z.string() });

/** The shared asset cache stores gzip; this source serves plain CSV, so compress it on the way in. */
export function gzipping(fetchFn: FetchFn): FetchFn {
  return async (url, init) => {
    const res = await fetchFn(url, init);
    if (!res.ok) return res;
    const body = gzipSync(Buffer.from(await res.arrayBuffer()));
    // Fresh headers: the original content-length/content-encoding describe the plain body.
    const headers = new Headers();
    for (const h of ["etag", "last-modified"]) {
      const v = res.headers.get(h);
      if (v !== null) headers.set(h, v);
    }
    return new Response(body, { status: res.status, headers });
  };
}

/**
 * DynastyProcess id crosswalk: sleeper_id to espn_id. Never throws. A sleeper_id listed with two
 * different espn ids is dropped (never guess) and reported as a warning.
 */
export async function getPlayerIdCrosswalk(
  opts: PlayerIdsOptions,
): Promise<ProviderResult<Map<string, string>>> {
  const fetchFn: FetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  try {
    const r = await loadAsset(
      {
        dir: join(opts.dataDir, "cache", "player-ids"),
        fetch: gzipping(fetchFn),
        now: opts.now,
        maxAgeMs: opts.maxAgeMs ?? 24 * 60 * 60 * 1000,
        ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
      },
      ASSET,
      opts.url ?? PLAYER_IDS_URL,
    );
    if (!r.ok) return { ok: false, reason: r.reason, message: `player ids: ${r.message}` };
    const table = parseCsvTable(r.text);
    for (const col of ["sleeper_id", "espn_id"]) {
      if (!table.header.includes(col)) {
        return { ok: false, reason: "parse", message: `player ids: missing column ${col}` };
      }
    }
    const out = new Map<string, string>();
    const conflicts = new Set<string>();
    for (const raw of table.rows) {
      const row = Row.safeParse(raw);
      if (!row.success) continue;
      const sleeper = ID.safeParse(row.data.sleeper_id.trim());
      const espn = ID.safeParse(row.data.espn_id.trim());
      if (!sleeper.success || !espn.success) continue;
      const prev = out.get(sleeper.data);
      if (prev !== undefined && prev !== espn.data) conflicts.add(sleeper.data);
      else out.set(sleeper.data, espn.data);
    }
    for (const id of conflicts) out.delete(id);
    // Reverse conflict: one espn_id claimed by several sleeper_ids. Drop all of them.
    const byEspn = new Map<string, Set<string>>();
    for (const [sleeper, espn] of out) {
      const set = byEspn.get(espn) ?? new Set<string>();
      set.add(sleeper);
      byEspn.set(espn, set);
    }
    const sharedEspn: string[] = [];
    for (const [espn, sleepers] of byEspn) {
      if (sleepers.size < 2) continue;
      sharedEspn.push(espn);
      for (const id of sleepers) out.delete(id);
    }
    const warnings = [...r.warnings];
    if (conflicts.size > 0) {
      warnings.push(
        `player ids: dropped ${conflicts.size} sleeper ids with conflicting espn ids (${[...conflicts].slice(0, 5).join(", ")})`,
      );
    }
    for (const espn of sharedEspn) {
      warnings.push(`player ids: espn id ${espn} shared by multiple sleeper ids, all dropped`);
    }
    return {
      ok: true,
      data: out,
      meta: {
        source: "dynastyprocess",
        assetUpdatedAt: r.meta.lastModified,
        fetchedAt: opts.now().toISOString(),
        fromCache: r.fromCache,
        warnings,
      },
    };
  } catch (e) {
    return {
      ok: false,
      reason: "parse",
      message: `player ids: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
