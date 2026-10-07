import type { DbHandle } from "@sideline/db";
import { getDb } from "../../../../lib/server/db";
import { gameNow } from "../../../../lib/server/game-clock";

export type PageRead<T> = { ok: true; value: T; now: Date } | { ok: false };

/**
 * Runs a synchronous server read. A missing database or a thrown read becomes `{ ok: false }` so
 * the page can show the db-error state. Next control-flow errors (notFound) pass through.
 */
export function readPage<T>(read: (h: DbHandle, now: Date) => T): PageRead<T> {
  try {
    const db = getDb();
    if (!db.ok) return { ok: false };
    const now = gameNow();
    return { ok: true, value: read(db.handle, now), now };
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
    return { ok: false };
  }
}
