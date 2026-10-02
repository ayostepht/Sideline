import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { http, HttpResponse } from "msw";
import pino from "pino";
import { loadConfig, type AppConfig, type SyncJobName } from "../../packages/shared/src/index.js";
import { RateLimiter } from "../../packages/sleeper/src/index.js";
import { createJobRegistry, ALL_ORDER } from "../../apps/worker/src/registry.js";
import { createAllJobs } from "../../apps/worker/src/jobs/index.js";
import { runJobs } from "../../apps/worker/src/runner.js";
import type { RunOutcome } from "../../apps/worker/src/types.js";
import { createTempDb, type TempDb } from "./temp-db.js";

/** Recorded fixture tree (tests/fixtures), written by the T0.3b recorder. */
export const fixturesRoot = path.resolve(import.meta.dirname, "../fixtures");
const manifest = JSON.parse(
  readFileSync(path.join(fixturesRoot, "sleeper", "manifest.json"), "utf8"),
) as { leagueId: string; recordedAt: string };

export const RECORDED_AT = manifest.recordedAt;
export const LEAGUE_ID = manifest.leagueId;

/** Tables and exact counts produced by a full fixture sync (db:seed:fixtures). */
export const EXPECTED_COUNTS = {
  players: 1021,
  leagues: 1,
  league_users: 10,
  rosters: 10,
  matchups: 140,
  transactions: 27,
  player_week_stats: 639,
  player_week_projections: 925,
  player_week_projection_snapshots: 893,
  trending: 100,
  schedule: 272,
  nfl_state: 1,
} as const;

/** A manually advanced clock. `sleep` advances it, so a limiter built on it never waits for real. */
export interface FakeClock {
  now(): Date;
  ms(): number;
  advance(ms: number): void;
  set(iso: string): void;
  sleep(ms: number): Promise<void>;
}

export function createFakeClock(startIso: string = RECORDED_AT): FakeClock {
  let t = Date.parse(startIso);
  return {
    now: () => new Date(t),
    ms: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (iso) => {
      t = Date.parse(iso);
    },
    sleep: (ms) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

/** The production limiter settings (5/s, 300 per 60 s) running on the fake clock. */
export function createFakeLimiter(clock: FakeClock): RateLimiter {
  return new RateLimiter({ now: () => clock.ms(), sleep: (ms) => clock.sleep(ms) });
}

const nflverseAssets: Record<string, string> = {
  "schedules/games": "nflverse/schedules/games.csv",
  "players/players": "nflverse/players/players.csv",
  "snap_counts/snap_counts_2026": "nflverse/snap_counts/snap_counts_2026.csv",
  "stats_player/stats_player_week_2026": "nflverse/stats_player/stats_player_week_2026.csv",
};

export interface NflverseMock {
  handler: ReturnType<typeof http.get>;
  /** URLs requested, in order. */
  readonly requests: string[];
  /** Replaces the games.csv body (plain CSV text) for later requests. */
  setGamesCsv(csv: string | null): void;
  /** Respond with this status for every nflverse request (null restores fixtures). */
  setStatus(status: number | null): void;
}

/** MSW handler for github.com nflverse release downloads, served from tests/fixtures/nflverse. */
export function createNflverseMock(): NflverseMock {
  const requests: string[] = [];
  let gamesOverride: string | null = null;
  let status: number | null = null;
  const handler = http.get(
    "https://github.com/nflverse/nflverse-data/releases/download/:tag/:file",
    ({ request, params }) => {
      requests.push(request.url);
      if (status !== null) return new HttpResponse("injected failure", { status });
      const key = `${String(params["tag"])}/${String(params["file"]).replace(/\.csv\.gz$/, "")}`;
      const rel = nflverseAssets[key];
      if (rel === undefined) return new HttpResponse("not found", { status: 404 });
      const csv = key === "schedules/games" && gamesOverride !== null ? gamesOverride : undefined;
      const text = csv ?? readFileSync(path.join(fixturesRoot, rel), "utf8");
      return new HttpResponse(new Uint8Array(gzipSync(Buffer.from(text))), {
        status: 200,
        headers: { "content-type": "application/gzip" },
      });
    },
  );
  return {
    handler,
    requests,
    setGamesCsv: (csv) => {
      gamesOverride = csv;
    },
    setStatus: (s) => {
      status = s;
    },
  };
}

/** games.csv with `gametime` blanked (or kept) per game, to exercise the kickoff fallback. */
export function gamesCsv(opts: { blankGametime: boolean }): string {
  const raw = readFileSync(path.join(fixturesRoot, "nflverse/schedules/games.csv"), "utf8");
  if (!opts.blankGametime) return raw;
  const lines = raw.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",");
  const idx = header.indexOf("gametime");
  return lines
    .map((line, i) => {
      if (i === 0 || line === "") return line;
      const cells = line.split(",");
      cells[idx] = "";
      return cells.join(",");
    })
    .join("\n");
}

export interface SyncHarness {
  tmp: TempDb;
  config: AppConfig;
  clock: FakeClock;
  limiter: RateLimiter;
  logger: pino.Logger;
  /** Every log record at warn or above, parsed (includes the Sleeper client's retry events). */
  logs: Record<string, unknown>[];
  /** Client retry events not yet consumed by a test driver (FIFO). */
  retryQueue: { url: string; delayMs: number; reason: string }[];
  registry: ReturnType<typeof createJobRegistry>;
  /** Runs jobs (default: all, in ALL_ORDER) through `runJobs`; never throws. */
  run(names?: readonly SyncJobName[], signal?: AbortSignal): Promise<RunOutcome[]>;
  count(table: string): number;
  counts(tables?: readonly string[]): Record<string, number>;
  runs(): {
    job: string;
    status: string;
    calls_made: number;
    rows_changed: number;
    error: string | null;
  }[];
  clearRuns(): void;
  cleanup(): void;
}

export function createSyncHarness(env: Record<string, string> = {}): SyncHarness {
  const tmp = createTempDb();
  const config = loadConfig({
    DATA_DIR: tmp.dataDir,
    DEFAULT_LEAGUE_ID: LEAGUE_ID,
    ...env,
  });
  const clock = createFakeClock();
  const limiter = createFakeLimiter(clock);
  const logs: Record<string, unknown>[] = [];
  const retryQueue: SyncHarness["retryQueue"] = [];
  // pino writes to a plain stream synchronously, so a retry event is visible the moment the
  // client emits it, which is just before it starts its backoff timer.
  const logger = pino(
    { level: "warn" },
    {
      write(line: string) {
        const rec = JSON.parse(line) as Record<string, unknown>;
        logs.push(rec);
        if (rec["type"] === "retry") {
          retryQueue.push({
            url: String(rec["url"]),
            delayMs: Number(rec["delayMs"]),
            reason: String(rec["reason"]),
          });
        }
      },
    },
  );
  const registry = createJobRegistry(createAllJobs({}));
  const never = new AbortController().signal;
  const count = (table: string): number =>
    (tmp.handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
  return {
    tmp,
    config,
    clock,
    limiter,
    logger,
    logs,
    retryQueue,
    registry,
    run: (names = ALL_ORDER, signal = never) =>
      runJobs(
        { db: tmp.handle, limiter, logger, config, now: () => clock.now(), signal: () => signal },
        registry,
        names,
      ),
    count,
    counts: (tables = Object.keys(EXPECTED_COUNTS)) =>
      Object.fromEntries(tables.map((t) => [t, count(t)])),
    runs: () =>
      tmp.handle.sqlite
        .prepare("SELECT job, status, calls_made, rows_changed, error FROM sync_runs ORDER BY id")
        .all() as ReturnType<SyncHarness["runs"]>,
    clearRuns: () => {
      tmp.handle.sqlite.prepare("DELETE FROM sync_runs").run();
    },
    cleanup: () => tmp.cleanup(),
  };
}
