// Applies pending @sideline/db migrations to the database at DATA_DIR, creating the file if it
// does not exist yet. Run by docker-entrypoint.sh (via tsx, since @sideline/db ships TS source)
// after the pre-migration backup, as the target PUID/PGID, so the resulting file already has the
// right ownership. Exits non-zero on failure so the entrypoint aborts before starting web/worker.
import { dbPathFromDataDir, isMigrated, migrate, openDb } from "@sideline/db";

const dataDir = process.env["DATA_DIR"] ?? "/data";
const dbPath = dbPathFromDataDir(dataDir);
const handle = openDb(dbPath);
try {
  migrate(handle);
  // Same safety check as packages/db/src/cli/migrate.ts: drizzleMigrate() returns successfully
  // having applied zero migrations if its migrations folder is empty or misresolved (e.g. a
  // future .dockerignore/COPY-path regression), which would otherwise let the container boot
  // against an unmigrated DB with no loud failure. Reusing isMigrated() here (rather than
  // re-deriving the check) keeps this script and the CLI one from drifting apart.
  if (!isMigrated(handle)) throw new Error("migrations did not apply cleanly");
  // eslint-disable-next-line no-console -- startup log; no logger instance exists at this point
  console.log(`[migrate] applied migrations to ${dbPath}`);
} finally {
  handle.sqlite.close();
}
