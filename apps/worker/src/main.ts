import { migrate, openDb, dbPathFromDataDir } from "@sideline/db";
import { loadConfig } from "@sideline/shared";
import { RateLimiter } from "@sideline/sleeper";
import pino from "pino";
import { createAllJobs, registeredJobs } from "./jobs/index.js";
import { fixtureFetchFromEnv } from "./fixture-mode.js";
import { LeaseKeeper, newHolderId } from "./lease.js";
import { createJobRegistry } from "./registry.js";
import { Worker, raceTimeout } from "./worker.js";

let fixtureFetch: typeof fetch | null;
try {
  fixtureFetch = fixtureFetchFromEnv(process.env);
} catch (e) {
  // eslint-disable-next-line no-console -- startup failure before the logger exists
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
if (fixtureFetch !== null) globalThis.fetch = fixtureFetch;
const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel, base: { app: "sideline-worker" } });
const db = openDb(dbPathFromDataDir(config.dataDir));
migrate(db);
const lease = new LeaseKeeper(db, newHolderId(), () => new Date());
const worker = new Worker({
  db,
  config,
  registry: createJobRegistry(
    fixtureFetch === null
      ? registeredJobs
      : createAllJobs({ sleeper: { fetch: fixtureFetch }, nflverse: { fetch: fixtureFetch } }),
  ),
  ...(fixtureFetch === null ? {} : { sleeper: { fetch: fixtureFetch } }),
  limiter: new RateLimiter(),
  logger,
  lease,
  now: () => new Date(),
});
worker.start();
logger.info({ holder: lease.holder, fixtureMode: fixtureFetch !== null }, "worker started");

const SHUTDOWN_WAIT_MS = 8_000;
let shuttingDown = false;
const shutdown = (sig: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ sig }, "shutting down");
  void raceTimeout(worker.stop(), SHUTDOWN_WAIT_MS).finally(() => {
    try {
      lease.release();
      db.sqlite.close();
    } catch {
      // exiting anyway
    }
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
