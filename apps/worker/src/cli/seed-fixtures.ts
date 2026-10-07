import {
  dbPathFromDataDir,
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  migrate,
  openDb,
  readUserLeagues,
  setActiveLeagueId,
  type DbHandle,
} from "@sideline/db";
import { loadConfig } from "@sideline/shared";
import { createCallCounter, RateLimiter } from "@sideline/sleeper";
import { pathToFileURL } from "node:url";
import pino, { type Logger } from "pino";
import { createAllJobs } from "../jobs/index.js";
import { runOnboardingJob } from "../jobs/onboarding.js";
import { createDefenseVsPositionRecomputeHook } from "../recompute-hooks/defense-vs-position.js";
import { createLeaguePointsRecomputeHook } from "../recompute-hooks/league-points.js";
import { recomputeHooks } from "../recompute.js";
import { createJobRegistry } from "../registry.js";
import { createFixtureFetch, FIXTURES_DIR, readManifest } from "../fixture-fetch.js";
import { runSyncCli } from "./sync.js";

export const SEED_TABLES = [
  "players",
  "leagues",
  "league_users",
  "rosters",
  "matchups",
  "transactions",
  "player_week_stats",
  "player_week_projections",
  "player_week_projection_snapshots",
  "trending",
  "schedule",
  "nfl_state",
  "player_news",
  "game_weather",
] as const;

export const FIXTURE_GAME_CLOCK = "2026-10-02T12:00:00Z";

export interface SeedDeps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  limiter?: RateLimiter;
  logger?: Logger;
  fixturesDir?: string;
  /** Skip storing the fixture user identity (anonymous, first-run state). Default false. */
  noIdentity?: boolean;
}

/** Everything the identity step stores, as one comparable string (for change counting). */
function identitySnapshot(db: DbHandle, userId: string, season: number): string {
  return JSON.stringify([
    getSleeperUsername(db),
    getSleeperUserId(db),
    getActiveLeagueId(db),
    readUserLeagues(db, userId, season),
  ]);
}

/** Runs the onboarding `user` and `user_leagues` jobs and selects the league, as a finished onboarding. */
async function seedIdentity(
  deps: SeedDeps,
  config: ReturnType<typeof loadConfig>,
  manifest: ReturnType<typeof readManifest>,
  fixtureFetch: typeof fetch,
  now: () => Date,
): Promise<void> {
  const { username, userId } = manifest;
  if (username === undefined || userId === undefined) {
    throw new Error("fixture manifest has no username/userId; re-record or use --no-identity");
  }
  const season = Number(manifest.season);
  const db = openDb(dbPathFromDataDir(config.dataDir));
  try {
    migrate(db);
    const before = identitySnapshot(db, userId, season);
    const ctx = {
      db,
      limiter: deps.limiter ?? new RateLimiter(),
      counter: createCallCounter(),
      now,
      logger: deps.logger ?? pino({ level: "silent" }),
      config,
      signal: new AbortController().signal,
    };
    const jobDeps = { fetch: fixtureFetch };
    await runOnboardingJob(ctx, jobDeps, "user", { username });
    await runOnboardingJob(ctx, jobDeps, "user_leagues", { userId, season });
    setActiveLeagueId(db, manifest.leagueId);
    const changed = identitySnapshot(db, userId, season) === before ? 0 : 1;
    deps.out(`identity: ${username} (${userId}), season ${season}, ${changed} rows changed`);
  } finally {
    db.sqlite.close();
  }
}

/**
 * The sanitized Sleeper players fixture carries no `espn_id`, so the player_news job finds nothing
 * to fetch. Give one rostered fixture player (Patrick Mahomes, who the recorded ESPN news is about)
 * his public ESPN athlete id so a second run of the real job stores the recorded notes and articles.
 */
export const NEWS_SEED_PLAYER_ID = "4046";
export const NEWS_SEED_ESPN_ID = "3139477";

function setNewsSeedEspnId(dbPath: string): void {
  const db = openDb(dbPath);
  try {
    db.sqlite
      .prepare("UPDATE players SET espn_id = ? WHERE player_id = ?")
      .run(NEWS_SEED_ESPN_ID, NEWS_SEED_PLAYER_ID);
  } finally {
    db.sqlite.close();
  }
}

/** Full worker sync (every job in ALL_ORDER) against recorded fixtures. Returns an exit code. */
export async function runSeed(deps: SeedDeps): Promise<number> {
  const dir = deps.fixturesDir ?? FIXTURES_DIR;
  const manifest = readManifest(dir);
  // The weather job reads football "now" from the game clock (ADR-019); pin it to the e2e time.
  const config = loadConfig({
    SIDELINE_GAME_CLOCK: FIXTURE_GAME_CLOCK,
    ...deps.env,
    DEFAULT_LEAGUE_ID: manifest.leagueId,
  });
  const fixtureFetch = createFixtureFetch(dir);
  // Belt and braces: anything that reaches for the global fetch fails loudly too.
  const realFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch;
  // The recording time is the clock: it matches the stored state and precedes the week's kickoffs.
  const now = (): Date => new Date(manifest.recordedAt);
  try {
    // This CLI runs its own job pipeline rather than exec-ing cli/sync.ts as a process (that
    // file's own bootstrap guard, which registers the same hook, never runs here), so register
    // and unregister around this one run instead of relying on a process-level singleton that
    // could otherwise accumulate duplicate hooks across repeated calls within one process (tests).
    const unregisterLeaguePoints = recomputeHooks.register(
      createLeaguePointsRecomputeHook({ logger: deps.logger ?? pino({ level: "silent" }) }),
    );
    const unregisterDefenseVsPosition = recomputeHooks.register(
      createDefenseVsPositionRecomputeHook({ logger: deps.logger ?? pino({ level: "silent" }) }),
    );
    let code: number;
    try {
      code = await runSyncCli(["--once", "--job=all"], {
        config,
        registry: createJobRegistry(
          createAllJobs({
            sleeper: { fetch: fixtureFetch },
            nflverse: { fetch: fixtureFetch },
            espn: { fetch: fixtureFetch },
            weather: { fetch: fixtureFetch, limiter: { acquire: () => Promise.resolve() } },
          }),
        ),
        limiter: deps.limiter ?? new RateLimiter(),
        logger: deps.logger ?? pino({ level: "silent" }),
        now,
        sleep: () => Promise.resolve(),
        out: deps.out,
      });
      if (code === 0) {
        setNewsSeedEspnId(dbPathFromDataDir(config.dataDir));
        code = await runSyncCli(["--once", "--job=player_news"], {
          config,
          registry: createJobRegistry(createAllJobs({ espn: { fetch: fixtureFetch } })),
          limiter: deps.limiter ?? new RateLimiter(),
          logger: deps.logger ?? pino({ level: "silent" }),
          now,
          sleep: () => Promise.resolve(),
          out: deps.out,
        });
      }
    } finally {
      unregisterLeaguePoints();
      unregisterDefenseVsPosition();
    }
    if (deps.noIdentity !== true) await seedIdentity(deps, config, manifest, fixtureFetch, now);
    const db = openDb(dbPathFromDataDir(config.dataDir));
    try {
      deps.out("row counts:");
      for (const t of SEED_TABLES) {
        const r = db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };
        deps.out(`  ${t}: ${r.n}`);
      }
    } finally {
      db.sqlite.close();
    }
    return code;
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* eslint-disable no-console -- CLI output */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed({
    env: process.env,
    out: (l) => console.log(l),
    noIdentity: process.argv.includes("--no-identity"),
  }).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
