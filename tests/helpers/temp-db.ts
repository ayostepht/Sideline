import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "../../packages/db/src/index.js";

export interface TempDb {
  /** Fresh DATA_DIR in the OS temp dir (also set as `process.env.DATA_DIR` by `useTempDb`). */
  readonly dataDir: string;
  readonly dbPath: string;
  readonly handle: DbHandle;
  /** Closes the connection and deletes the directory. Idempotent. */
  cleanup(): void;
}

/** Creates a migrated, empty SQLite database in a fresh temp DATA_DIR. */
export function createTempDb(): TempDb {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sideline-it-"));
  const dbPath = dbPathFromDataDir(dataDir);
  const handle = openDb(dbPath);
  migrate(handle);
  let cleaned = false;
  return {
    dataDir,
    dbPath,
    handle,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      try {
        handle.sqlite.close();
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}
