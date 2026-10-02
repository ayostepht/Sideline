import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "@sideline/db";
import { resetDbForTests } from "./db";

export interface TempDb {
  dir: string;
  /** Separate handle for seeding; the code under test opens its own via DATA_DIR. */
  handle: DbHandle | null;
  cleanup(): void;
}

/** Points DATA_DIR at a fresh temp dir; optionally migrates it. Test-only. */
export function useTempDb(opts: { migrated: boolean }): TempDb {
  resetDbForTests();
  const dir = mkdtempSync(join(tmpdir(), "sideline-web-"));
  process.env["DATA_DIR"] = dir;
  const handle = openDb(dbPathFromDataDir(dir));
  if (opts.migrated) migrate(handle);
  return {
    dir,
    handle,
    cleanup() {
      resetDbForTests();
      handle.sqlite.close();
      rmSync(dir, { recursive: true, force: true });
      delete process.env["DATA_DIR"];
    },
  };
}
