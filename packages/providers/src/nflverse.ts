import { join } from "node:path";
import { type FetchFn, loadAsset } from "./cache.js";
import { type CsvTable, parseCsvTable } from "./csv.js";
import { mapSchedule } from "./schedule.js";
import type { PlayerRef, ProviderResult, ScheduleProvider, UsageProvider } from "./types.js";
import { joinUsage } from "./usage.js";

export interface NflverseOptions {
  enabled: boolean;
  dataDir: string;
  fetch?: FetchFn;
  now: () => Date;
  maxAgeMs?: number;
}

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";
const SOURCE = "nflverse";

type Loaded = {
  table: CsvTable;
  assetUpdatedAt: string | null;
  fromCache: boolean;
  warnings: string[];
};

export function createNflverseProvider(opts: NflverseOptions): ScheduleProvider & UsageProvider {
  const fetchFn: FetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  const cacheOpts = {
    dir: join(opts.dataDir, "cache", "nflverse"),
    fetch: fetchFn,
    now: opts.now,
    maxAgeMs: opts.maxAgeMs ?? 24 * 60 * 60 * 1000,
  };
  const disabled = { ok: false, reason: "disabled", message: "nflverse is disabled" } as const;

  async function load(
    tag: string,
    asset: string,
  ): Promise<Loaded | { reason: "network" | "not_found" | "parse"; message: string }> {
    try {
      const r = await loadAsset(cacheOpts, asset, `${BASE}/${tag}/${asset}`);
      if (!r.ok) return r;
      return {
        table: parseCsvTable(r.text),
        assetUpdatedAt: r.meta.lastModified,
        fromCache: r.fromCache,
        warnings: r.warnings,
      };
    } catch (e) {
      return {
        reason: "parse",
        message: `${asset}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const meta = (l: Loaded, warnings: string[]) => ({
    source: SOURCE,
    assetUpdatedAt: l.assetUpdatedAt,
    fetchedAt: opts.now().toISOString(),
    fromCache: l.fromCache,
    warnings: [...l.warnings, ...warnings],
  });

  return {
    async getSchedule(season) {
      if (!opts.enabled) return disabled;
      const l = await load("schedules", "games.csv.gz");
      if (!("table" in l)) return { ok: false, reason: l.reason, message: l.message };
      const mapped = mapSchedule(l.table, season);
      if ("error" in mapped) return { ok: false, reason: "parse", message: mapped.error };
      return { ok: true, data: mapped.games, meta: meta(l, mapped.warnings) };
    },

    async getUsage(season, weeks, players: readonly PlayerRef[]) {
      if (!opts.enabled) return disabled;
      const stats = await load("stats_player", `stats_player_week_${season}.csv.gz`);
      if (!("table" in stats)) return { ok: false, reason: stats.reason, message: stats.message };
      const snaps = await load("snap_counts", `snap_counts_${season}.csv.gz`);
      const extra =
        "table" in snaps ? snaps.warnings : [`snap counts unavailable: ${snaps.message}`];
      const joined = joinUsage(
        stats.table,
        "table" in snaps ? snaps.table : null,
        season,
        weeks,
        players,
      );
      if ("error" in joined) return { ok: false, reason: "parse", message: joined.error };
      const result: ProviderResult<typeof joined.data> = {
        ok: true,
        data: joined.data,
        meta: meta(stats, [...extra, ...joined.warnings]),
      };
      return result;
    },
  };
}
