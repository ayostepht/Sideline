/**
 * Fixture recorder (`pnpm fixtures:record`).
 *
 * Fetches the real league (through a polite, cached, throttled fetcher), sanitizes and trims it,
 * and writes commit-safe fixtures to tests/fixtures/sleeper/ in the layout the MSW handlers expect.
 * Raw responses stay in the gitignored .spike-cache/.
 *
 *   pnpm exec tsx scripts/fixtures/record.ts                    record (reuse cache newer than 2 h)
 *   pnpm exec tsx scripts/fixtures/record.ts --refresh          refetch everything except players
 *   pnpm exec tsx scripts/fixtures/record.ts --check            fail if any original identifier is
 *                                                               present anywhere in the repo
 *   pnpm exec tsx scripts/fixtures/record.ts --check --root DIR scan only that directory
 *   --max-age-hours N                                           cache reuse window (positive number)
 *   --root must resolve under tests/fixtures; unknown flags and missing values are errors.
 *
 * Reads SLEEPER_USERNAME and DEFAULT_LEAGUE_ID from the gitignored .env. Never writes them.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { buildFixtureFiles, type RecordedInput } from "./build.js";
import { API_ROOT, createFetcher, maxCallsPerMinute, type Fetcher } from "./fetch-cache.js";
import { findLeaks, type FixtureFile } from "./leak-check.js";
import { readRepoFiles } from "./repo-files.js";
import { collectIdentifiers, type RawLeagueData } from "./sanitize.js";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, ".spike-cache");
const POSITIONS =
  "season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF";

export interface Args {
  check: boolean;
  refresh: boolean;
  root: string;
  rootGiven: boolean;
  maxAgeHours: number;
}

function valueOf(argv: readonly string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
  return v;
}

/**
 * Parses and validates arguments. Throws before anything touches the disk. `--root` must resolve
 * to a directory strictly under `<repoRoot>/tests/fixtures`.
 */
export function parseArgs(argv: readonly string[], repoRoot: string = REPO_ROOT): Args {
  const args: Args = {
    check: false,
    refresh: false,
    root: join(repoRoot, "tests", "fixtures", "sleeper"),
    rootGiven: false,
    maxAgeHours: 2,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--refresh") args.refresh = true;
    else if (a === "--root") {
      const root = resolve(repoRoot, valueOf(argv, i, a));
      i += 1;
      const rel = relative(join(repoRoot, "tests", "fixtures"), root);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error("--root must be a directory under tests/fixtures");
      }
      args.root = root;
      args.rootGiven = true;
    } else if (a === "--max-age-hours") {
      const hours = Number(valueOf(argv, i, a));
      i += 1;
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error("--max-age-hours must be a positive number");
      }
      args.maxAgeHours = hours;
    } else throw new Error(`unknown argument: ${a ?? ""}`);
  }
  return args;
}

function loadEnv(): { username: string; leagueId: string } {
  const text = readFileSync(join(REPO_ROOT, ".env"), "utf8");
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

function rec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function listFiles(root: string): FixtureFile[] {
  const out: FixtureFile[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push({ path: relative(root, full), text: readFileSync(full, "utf8") });
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

interface RawFetch {
  input: Omit<RecordedInput, "recordedAt">;
  stateFetchedAtMs: number;
}

/** Fetches every document the fixtures need (the league documents only when `leagueOnly`). */
async function fetchAll(
  f: Fetcher,
  env: { username: string; leagueId: string },
  leagueOnly: boolean,
): Promise<RawFetch> {
  const v1 = `${API_ROOT}/v1`;
  const get = async (url: string): Promise<unknown> => (await f.getJson(url)).body;
  const stateRes = await f.getJson(`${v1}/state/nfl`);
  const state = rec(stateRes.body);
  const season = String(state.season);
  const currentWeek = Number(state.week);
  if (!Number.isInteger(currentWeek) || currentWeek < 1)
    throw new Error("unexpected /state/nfl shape");
  if (state.season_type !== "regular")
    console.warn(`warning: season_type is ${String(state.season_type)}`);

  const user = await get(`${v1}/user/${encodeURIComponent(env.username)}`);
  const userId = rec(user).user_id;
  if (typeof userId !== "string") throw new Error("SLEEPER_USERNAME did not resolve to a user");
  const userLeagues = await get(`${v1}/user/${userId}/leagues/nfl/${season}`);
  const L = `${v1}/league/${env.leagueId}`;
  const league = await get(L);
  const users = await get(`${L}/users`);
  const rosters = await get(`${L}/rosters`);
  const settings = rec(rec(league).settings);
  const playoffStart = Number(settings.playoff_week_start ?? 15);
  const matchups: Record<number, unknown> = {};
  for (let w = 1; w < playoffStart; w += 1) matchups[w] = await get(`${L}/matchups/${w}`);
  const transactions: Record<number, unknown> = {};
  for (let w = 1; w <= currentWeek; w += 1) transactions[w] = await get(`${L}/transactions/${w}`);
  const tradedPicks = await get(`${L}/traded_picks`);
  const winnersBracket = await get(`${L}/winners_bracket`);
  const losersBracket = await get(`${L}/losers_bracket`);
  const drafts = await get(`${L}/drafts`);
  const draftPicks: Record<string, unknown> = {};
  for (const d of Array.isArray(drafts) ? (drafts as unknown[]) : []) {
    const id = rec(d).draft_id;
    if (typeof id === "string") draftPicks[id] = await get(`${v1}/draft/${id}/picks`);
  }
  const trendingAdd = await get(`${v1}/players/nfl/trending/add?lookback_hours=24&limit=50`);
  const trendingDrop = await get(`${v1}/players/nfl/trending/drop?lookback_hours=24&limit=50`);

  const projections: Record<number, readonly unknown[]> = {};
  const stats: Record<number, readonly unknown[]> = {};
  let players: Record<string, unknown> = {};
  if (!leagueOnly) {
    // Cached copy under 24 h is always reused (see decideCache); no network call in that case.
    players = rec(await get(`${v1}/players/nfl`));
    for (let w = 1; w <= currentWeek + 1; w += 1) {
      const rows = await get(`${API_ROOT}/projections/nfl/${season}/${w}?${POSITIONS}`);
      projections[w] = Array.isArray(rows) ? (rows as unknown[]) : [];
    }
    for (let w = 1; w <= currentWeek; w += 1) {
      const rows = await get(`${API_ROOT}/stats/nfl/${season}/${w}?${POSITIONS}`);
      stats[w] = Array.isArray(rows) ? (rows as unknown[]) : [];
    }
  }
  return {
    stateFetchedAtMs: stateRes.fetchedAtMs,
    input: {
      season,
      currentWeek,
      primaryLeagueId: env.leagueId,
      state: stateRes.body,
      user,
      userLeagues,
      league,
      users,
      rosters,
      matchups,
      transactions,
      tradedPicks,
      winnersBracket,
      losersBracket,
      drafts,
      draftPicks,
      trendingAdd,
      trendingDrop,
      players,
      projections,
      stats,
      extraNames: [env.username],
    },
  };
}

async function runCheck(args: Args): Promise<number> {
  const env = loadEnv();
  // Raw data comes from the cache (any age); missing documents are fetched once.
  const fetcher = createFetcher({
    cacheDir: CACHE_DIR,
    refresh: false,
    maxAgeMs: Number.POSITIVE_INFINITY,
  });
  const { input } = await fetchAll(fetcher, env, true);
  const raw: RawLeagueData = {
    user: input.user,
    userLeagues: input.userLeagues,
    league: input.league,
    users: input.users,
    rosters: input.rosters,
    drafts: input.drafts,
    draftPicks: Object.values(input.draftPicks),
    transactions: Object.values(input.transactions),
    extra: [
      ...Object.values(input.matchups),
      input.tradedPicks,
      input.winnersBracket,
      input.losersBracket,
    ],
  };
  const identifiers = collectIdentifiers(raw, env.leagueId, {
    ids: [env.leagueId],
    names: [env.username],
  });
  // Default: the whole repo (ADR-000). `--root DIR` narrows the scan to one directory.
  const files = args.rootGiven ? listFiles(args.root) : readRepoFiles(REPO_ROOT);
  if (files.length === 0) {
    console.error("check: no files to scan");
    return 1;
  }
  const leaks = findLeaks(files, identifiers);
  console.log(
    `check: ${files.length} files, ${identifiers.ids.length} ids, ${identifiers.names.length} names, ${identifiers.avatars.length} avatars scanned; ${fetcher.calls.length} network calls`,
  );
  if (leaks.length === 0) {
    console.log("check: OK, no original identifiers found");
    return 0;
  }
  for (const l of leaks) console.error(`LEAK ${l.file} ${l.category}#${l.index}`);
  console.error(`check: FAILED with ${leaks.length} leak(s)`);
  return 1;
}

async function runRecord(args: Args): Promise<number> {
  const env = loadEnv();
  const fetcher = createFetcher({
    cacheDir: CACHE_DIR,
    refresh: args.refresh,
    maxAgeMs: args.maxAgeHours * 3_600_000,
  });
  const { input, stateFetchedAtMs } = await fetchAll(fetcher, env, false);
  const result = buildFixtureFiles({
    ...input,
    recordedAt: new Date(stateFetchedAtMs).toISOString(),
  });

  if (!args.root.endsWith(join("tests", "fixtures", "sleeper"))) {
    throw new Error("refusing to clear a directory that is not tests/fixtures/sleeper");
  }
  rmSync(args.root, { recursive: true, force: true });
  for (const [path, text] of result.files) {
    const full = join(args.root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  const times = fetcher.calls.map((c) => c.atMs);
  const playersCalls = fetcher.calls.filter((c) => /\/v1\/players\/nfl$/.test(c.url)).length;
  console.log(`wrote ${result.files.size} files to ${relative(REPO_ROOT, args.root)}`);
  console.log(
    `calls made: ${fetcher.calls.length} (players/nfl calls: ${playersCalls}), max calls in any 60 s window: ${maxCallsPerMinute(times)}`,
  );
  console.log(
    `manifest: weeks ${JSON.stringify(result.manifest.weeks)}, partialWeeks ${JSON.stringify(result.manifest.partialWeeks)}`,
  );
  return 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.exitCode = args.check ? await runCheck(args) : await runRecord(args);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
