// Applies pending @sideline/db migrations to the database at DATA_DIR, creating the file if it
// does not exist yet. Run by docker-entrypoint.sh (via tsx, since @sideline/db ships TS source)
// after the pre-migration backup, as the target PUID/PGID, so the resulting file already has the
// right ownership. Exits non-zero on failure so the entrypoint aborts before starting web/worker.
import { migrate, openDb, dbPathFromDataDir } from "@sideline/db";

const dataDir = process.env["DATA_DIR"] ?? "/data";
const dbPath = dbPathFromDataDir(dataDir);
const handle = openDb(dbPath);
try {
  migrate(handle);
  // eslint-disable-next-line no-console -- startup log; no logger instance exists at this point
  console.log(`[migrate] applied migrations to ${dbPath}`);
} finally {
  handle.sqlite.close();
}
