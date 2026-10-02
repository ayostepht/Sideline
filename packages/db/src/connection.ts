import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;
export interface DbHandle {
  /** Raw better-sqlite3 connection (pragmas, IMMEDIATE transactions, close). */
  sqlite: Database.Database;
  /** Drizzle wrapper over the same connection. */
  db: Db;
}

export const DB_FILE_NAME = "sideline.sqlite";

/** `<dataDir>/sideline.sqlite`. */
export function dbPathFromDataDir(dataDir: string): string {
  return join(dataDir, DB_FILE_NAME);
}

/**
 * Opens (and for writers, creates) the database with the pragmas from PLAN 12: WAL so the web
 * process can read while the worker writes, `busy_timeout` so writers wait instead of failing,
 * foreign keys on, `synchronous=NORMAL` (safe with WAL).
 */
export function openDb(path: string, options: { readonly?: boolean } = {}): DbHandle {
  const readonly = options.readonly === true;
  if (!readonly) mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { readonly, fileMustExist: readonly });
  sqlite.pragma("busy_timeout = 5000");
  // A readonly connection cannot switch the journal mode, but WAL is persistent in the file.
  if (!readonly) sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  if (!readonly) sqlite.pragma("synchronous = NORMAL");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/**
 * Migrations folder (SQL files plus `meta/_journal.json`), resolved relative to this module:
 * `src/` in dev (tsx, vitest) gives `packages/db/drizzle`. A bundled build must copy the `drizzle`
 * folder next to the bundle (so `../drizzle` from the bundled file's directory resolves) or pass
 * `migrationsFolder` / set `SIDELINE_MIGRATIONS_DIR`. T1.8 wires this into the image.
 */
export function defaultMigrationsFolder(): string {
  const override = process.env["SIDELINE_MIGRATIONS_DIR"];
  if (override !== undefined && override !== "") return override;
  return fileURLToPath(new URL("../drizzle", import.meta.url));
}

/** Applies all pending migrations. Idempotent. */
export function migrate(
  handle: DbHandle,
  migrationsFolder: string = defaultMigrationsFolder(),
): void {
  drizzleMigrate(handle.db, { migrationsFolder });
}

const JournalSchema = z.object({ entries: z.array(z.unknown()) });

/** Number of migrations the folder's journal lists. */
function journalCount(migrationsFolder: string): number {
  const raw: unknown = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  return JournalSchema.parse(raw).entries.length;
}

/** True when every migration in the journal is recorded as applied (used by health). Never throws. */
export function isMigrated(
  handle: DbHandle,
  migrationsFolder: string = defaultMigrationsFolder(),
): boolean {
  try {
    const expected = journalCount(migrationsFolder);
    const table = handle.sqlite
      .prepare(
        "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
      )
      .get();
    if (table === undefined) return expected === 0;
    const row = handle.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as {
      n: number;
    };
    return row.n >= expected;
  } catch {
    return false;
  }
}
