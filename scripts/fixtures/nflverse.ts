/**
 * nflverse fixture recorder.
 *
 *   pnpm exec tsx scripts/fixtures/nflverse.ts               use cache, download whatever is missing
 *   pnpm exec tsx scripts/fixtures/nflverse.ts --from-cache  no network; fail if the cache is missing
 *   --season N (default 2026)   --through-week N (default 3)
 *
 * Raw downloads live only in the gitignored `.spike-cache/nflverse/`. Output goes to
 * `tests/fixtures/nflverse/`, trimmed and sorted so reruns from the same cache are byte-identical.
 * No Sleeper API calls; the only Sleeper input is the committed player fixture (ids, names, teams).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  buildMatcher,
  inWindow,
  keepSnapRow,
  keepStatsRow,
  parseCsv,
  sortRows,
  toCsv,
  trimColumns,
  type CsvRow,
  type CsvTable,
  type SleeperPlayerLite,
} from "./nflverse-lib.js";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, ".spike-cache", "nflverse");
const OUT_DIR = join(REPO_ROOT, "tests", "fixtures", "nflverse");
const SLEEPER_PLAYERS = join(REPO_ROOT, "tests/fixtures/sleeper/v1/players/nfl.json");
const USER_AGENT = "Sideline-fixture-recorder/0.0.0 (self-hosted)";
const GAP_MS = 1100;
/** Two teams kept in full for team-share sanity checks (both play weeks 1 to 3, no bye). */
const KEEP_TEAMS: ReadonlySet<string> = new Set(["KC", "SF"]);

interface AssetSpec {
  key: string;
  tag: string;
  name: (season: number) => string;
}

const ASSETS: readonly AssetSpec[] = [
  { key: "schedules", tag: "schedules", name: () => "games.csv.gz" },
  { key: "stats", tag: "stats_player", name: (s) => `stats_player_week_${s}.csv.gz` },
  { key: "snaps", tag: "snap_counts", name: (s) => `snap_counts_${s}.csv.gz` },
  { key: "players", tag: "players", name: () => "players.csv.gz" },
];

const SCHEDULE_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "gameday",
  "weekday",
  "gametime",
  "away_team",
  "away_score",
  "home_team",
  "home_score",
  "location",
  "result",
  "total",
  "spread_line",
  "total_line",
  "home_moneyline",
  "away_moneyline",
  "roof",
  "stadium",
];
const STATS_COLUMNS = [
  "player_id",
  "player_display_name",
  "position",
  "position_group",
  "season",
  "week",
  "season_type",
  "game_id",
  "team",
  "opponent_team",
  "completions",
  "attempts",
  "passing_yards",
  "carries",
  "rushing_yards",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_air_yards",
  "target_share",
  "air_yards_share",
  "wopr",
  "fantasy_points_ppr",
];
const SNAP_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "player",
  "pfr_player_id",
  "position",
  "team",
  "opponent",
  "offense_snaps",
  "offense_pct",
];
const PLAYER_COLUMNS = [
  "gsis_id",
  "pfr_id",
  "display_name",
  "position",
  "latest_team",
  "last_season",
];

interface CacheMeta {
  assets: Record<string, { url: string; updatedAt: string; size: number; downloadedAt: string }>;
}

function parseFlags(argv: readonly string[]): {
  fromCache: boolean;
  season: number;
  through: number;
} {
  const out = { fromCache: false, season: 2026, through: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--from-cache") out.fromCache = true;
    else if (a === "--season" || a === "--through-week") {
      const v = Number(argv[i + 1]);
      if (!Number.isInteger(v) || v < 1) throw new Error(`${a} needs a positive integer`);
      if (a === "--season") out.season = v;
      else out.through = v;
      i += 1;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function getWithRetry(url: string, accept: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`GET ${url} failed: ${res.status}`);
  }
}

async function downloadMissing(
  season: number,
  meta: CacheMeta,
): Promise<{ meta: CacheMeta; calls: number }> {
  let calls = 0;
  for (const spec of ASSETS) {
    const name = spec.name(season);
    if (existsSync(join(CACHE_DIR, name)) && meta.assets[name]) continue;
    await sleep(GAP_MS);
    const api = `https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${spec.tag}`;
    const rel = (await (await getWithRetry(api, "application/vnd.github+json")).json()) as {
      assets?: { name: string; size: number; updated_at: string; browser_download_url: string }[];
    };
    calls += 1;
    const asset = rel.assets?.find((a) => a.name === name);
    if (!asset) throw new Error(`asset ${name} not found in release ${spec.tag}`);
    await sleep(GAP_MS);
    const res = await getWithRetry(asset.browser_download_url, "application/octet-stream");
    calls += 1;
    writeFileSync(join(CACHE_DIR, name), Buffer.from(await res.arrayBuffer()));
    meta.assets[name] = {
      url: asset.browser_download_url,
      updatedAt: asset.updated_at,
      size: asset.size,
      downloadedAt: new Date().toISOString(),
    };
    writeFileSync(join(CACHE_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  return { meta, calls };
}

function readTable(name: string): CsvTable {
  return parseCsv(gunzipSync(readFileSync(join(CACHE_DIR, name))).toString("utf8"));
}

function write(rel: string, content: string): void {
  const path = join(OUT_DIR, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function main(): Promise<void> {
  const { fromCache, season, through } = parseFlags(process.argv.slice(2));
  mkdirSync(CACHE_DIR, { recursive: true });
  const metaPath = join(CACHE_DIR, "meta.json");
  let meta: CacheMeta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as CacheMeta)
    : { assets: {} };
  const missing = ASSETS.filter(
    (s) => !existsSync(join(CACHE_DIR, s.name(season))) || !meta.assets[s.name(season)],
  );
  let calls = 0;
  if (missing.length > 0) {
    if (fromCache) {
      throw new Error(
        `--from-cache but cache is missing: ${missing.map((s) => s.name(season)).join(", ")}`,
      );
    }
    ({ meta, calls } = await downloadMissing(season, meta));
  }

  const sleeperPlayers = Object.values(
    JSON.parse(readFileSync(SLEEPER_PLAYERS, "utf8")) as Record<string, SleeperPlayerLite>,
  );
  const matcher = buildMatcher(sleeperPlayers);

  const scheduleAll = readTable("games.csv.gz");
  const schedule = sortRows(
    scheduleAll.rows.filter((r) => Number(r["season"]) === season),
    ["week", "gameday", "gametime", "game_id"],
  );
  const scheduleOut = trimColumns({ header: scheduleAll.header, rows: schedule }, SCHEDULE_COLUMNS);

  const statsAll = readTable(`stats_player_week_${season}.csv.gz`);
  const statsRows = statsAll.rows.filter(
    (r) =>
      inWindow(r, season, through) &&
      r["season_type"] === "REG" &&
      keepStatsRow(r, { matcher, keepTeams: KEEP_TEAMS }),
  );
  const keptGsis = new Set(statsRows.map((r) => r["player_id"] ?? "").filter((g) => g !== ""));
  const statsOut = trimColumns(
    {
      header: statsAll.header,
      rows: sortRows(statsRows, ["week", "team", "position", "player_id", "player_display_name"]),
    },
    STATS_COLUMNS,
  );

  const playersAll = readTable("players.csv.gz");
  const pfrByGsis = new Map(playersAll.rows.map((r) => [r["gsis_id"] ?? "", r["pfr_id"] ?? ""]));
  const keepPfrIds = new Set<string>();
  for (const g of keptGsis) {
    const pfr = pfrByGsis.get(g);
    if (pfr) keepPfrIds.add(pfr);
  }
  const snapsAll = readTable(`snap_counts_${season}.csv.gz`);
  const snapRows = snapsAll.rows.filter(
    (r) =>
      inWindow(r, season, through) &&
      r["game_type"] === "REG" &&
      keepSnapRow(r, { matcher, keepTeams: KEEP_TEAMS, keepPfrIds }),
  );
  const snapOut = trimColumns(
    {
      header: snapsAll.header,
      rows: sortRows(snapRows, ["week", "team", "pfr_player_id", "game_id"]),
    },
    SNAP_COLUMNS,
  );
  const snapPfr = new Set(snapRows.map((r) => r["pfr_player_id"] ?? ""));
  const playerRows: CsvRow[] = playersAll.rows.filter(
    (r) => keptGsis.has(r["gsis_id"] ?? "") || snapPfr.has(r["pfr_id"] ?? ""),
  );
  const playersOut = trimColumns(
    { header: playersAll.header, rows: sortRows(playerRows, ["gsis_id", "pfr_id"]) },
    PLAYER_COLUMNS,
  );

  rmSync(OUT_DIR, { recursive: true, force: true });
  const files: Record<string, { rows: number; columns: string[]; source: string }> = {};
  const emit = (rel: string, table: CsvTable, assetName: string): void => {
    write(rel, toCsv(table.header, table.rows));
    const a = meta.assets[assetName];
    files[rel] = { rows: table.rows.length, columns: table.header, source: a?.url ?? assetName };
  };
  emit("schedules/games.csv", scheduleOut, "games.csv.gz");
  emit(
    `stats_player/stats_player_week_${season}.csv`,
    statsOut,
    `stats_player_week_${season}.csv.gz`,
  );
  emit(`snap_counts/snap_counts_${season}.csv`, snapOut, `snap_counts_${season}.csv.gz`);
  emit("players/players.csv", playersOut, "players.csv.gz");

  const manifest = {
    season,
    throughWeek: through,
    keepTeams: [...KEEP_TEAMS].sort(),
    note: "Trimmed copies of nflverse release assets (original header names and CSV format). Stats and snaps keep rows for Sleeper fixture players (gsis id or normalized name plus team) and all rows for keepTeams.",
    assets: Object.fromEntries(
      Object.entries(meta.assets)
        .filter(([name]) => ASSETS.some((s) => s.name(season) === name))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, a]) => [name, { url: a.url, updatedAt: a.updatedAt, size: a.size }]),
    ),
    recordedAt: Object.values(meta.assets)
      .map((a) => a.downloadedAt)
      .sort()
      .at(-1),
    files,
  };
  write("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `nflverse fixtures written (${calls} network calls): ${Object.entries(files)
      .map(([k, v]) => `${k}=${v.rows}`)
      .join(", ")}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
