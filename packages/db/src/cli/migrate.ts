import { loadConfig } from "@sideline/shared";
import { dbPathFromDataDir, isMigrated, migrate, openDb } from "../connection.js";

/** `pnpm db:migrate`: applies migrations to `<DATA_DIR>/sideline.sqlite`. */
function main(): void {
  const config = loadConfig(process.env);
  const path = dbPathFromDataDir(config.dataDir);
  const handle = openDb(path);
  try {
    migrate(handle);
    if (!isMigrated(handle)) throw new Error("migrations did not apply cleanly");
    process.stdout.write(`db:migrate ok: ${path} is up to date\n`);
  } finally {
    handle.sqlite.close();
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`db:migrate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
