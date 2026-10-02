import { dbPathFromDataDir, openDb, type DbHandle } from "@sideline/db";
import { loadConfig } from "@sideline/shared";

export type DbState = { ok: true; handle: DbHandle } | { ok: false; error: string };

let state: DbState | null = null;

/**
 * One lazily opened read-write handle per process (POST /api/sync/run enqueues). Never migrates.
 * An open failure is kept (and retried on the next call) so health can report it instead of crashing.
 */
export function getDb(env: Record<string, string | undefined> = process.env): DbState {
  if (state?.ok === true) return state;
  try {
    const { dataDir } = loadConfig(env);
    state = { ok: true, handle: openDb(dbPathFromDataDir(dataDir)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "database open failed" };
  }
  return state;
}

/** Test helper: closes and forgets the singleton. */
export function resetDbForTests(): void {
  if (state?.ok === true) {
    try {
      state.handle.sqlite.close();
    } catch {
      // already closed
    }
  }
  state = null;
}
