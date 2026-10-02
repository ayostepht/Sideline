import { dbPathFromDataDir, openDb } from "@sideline/db";
import { loadConfig } from "@sideline/shared";
import { RateLimiter } from "@sideline/sleeper";
import { pathToFileURL } from "node:url";
import pino, { type Logger } from "pino";
import { createAllJobs } from "../jobs/index.js";
import { createJobRegistry } from "../registry.js";
import { createFixtureFetch, FIXTURES_DIR, readManifest } from "./fixture-fetch.js";
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
] as const;

export interface SeedDeps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  limiter?: RateLimiter;
  logger?: Logger;
  fixturesDir?: string;
}

/** Full worker sync (every job in ALL_ORDER) against recorded fixtures. Returns an exit code. */
export async function runSeed(deps: SeedDeps): Promise<number> {
  const dir = deps.fixturesDir ?? FIXTURES_DIR;
  const manifest = readManifest(dir);
  const config = loadConfig({ ...deps.env, DEFAULT_LEAGUE_ID: manifest.leagueId });
  const fixtureFetch = createFixtureFetch(dir);
  // Belt and braces: anything that reaches for the global fetch fails loudly too.
  const realFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch;
  // The recording time is the clock: it matches the stored state and precedes the week's kickoffs.
  const now = (): Date => new Date(manifest.recordedAt);
  try {
    const code = await runSyncCli(["--once", "--job=all"], {
      config,
      registry: createJobRegistry(
        createAllJobs({ sleeper: { fetch: fixtureFetch }, nflverse: { fetch: fixtureFetch } }),
      ),
      limiter: deps.limiter ?? new RateLimiter(),
      logger: deps.logger ?? pino({ level: "silent" }),
      now,
      sleep: () => Promise.resolve(),
      out: deps.out,
    });
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
  runSeed({ env: process.env, out: (l) => console.log(l) }).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
