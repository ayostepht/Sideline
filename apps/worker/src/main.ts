import { migrate, openDb, dbPathFromDataDir } from "@sideline/db";
import { loadConfig } from "@sideline/shared";
import { RateLimiter } from "@sideline/sleeper";
import pino from "pino";
import { registeredJobs } from "./jobs/index.js";
import { LeaseKeeper, newHolderId } from "./lease.js";
import { createJobRegistry } from "./registry.js";
import { Worker } from "./worker.js";

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel, base: { app: "sideline-worker" } });
const db = openDb(dbPathFromDataDir(config.dataDir));
migrate(db);
const lease = new LeaseKeeper(db, newHolderId(), () => new Date());
const worker = new Worker({
  db,
  config,
  registry: createJobRegistry(registeredJobs),
  limiter: new RateLimiter(),
  logger,
  lease,
  now: () => new Date(),
});
worker.start();
logger.info({ holder: lease.holder }, "worker started");

let shuttingDown = false;
const shutdown = (sig: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ sig }, "shutting down");
  void worker.stop().finally(() => {
    db.sqlite.close();
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
