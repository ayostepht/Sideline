import { and, asc, eq } from "drizzle-orm";
import type { LeagueChoice } from "@sideline/shared";
import type { DbHandle } from "./connection.js";
import { userLeagues } from "./schema.js";

/** Replaces the user's stored leagues for `season` in one transaction. */
export function saveUserLeagues(
  h: DbHandle,
  userId: string,
  season: number,
  leagues: LeagueChoice[],
  now: Date,
): void {
  h.db.transaction((tx) => {
    tx.delete(userLeagues)
      .where(and(eq(userLeagues.userId, userId), eq(userLeagues.season, season)))
      .run();
    for (const l of leagues) {
      tx.insert(userLeagues)
        .values({
          userId,
          leagueId: l.leagueId,
          season: l.season,
          name: l.name,
          status: l.status,
          totalRosters: l.totalRosters,
          avatar: l.avatar,
          syncedAt: now.toISOString(),
        })
        .onConflictDoUpdate({
          target: [userLeagues.userId, userLeagues.leagueId, userLeagues.season],
          set: {
            name: l.name,
            status: l.status,
            totalRosters: l.totalRosters,
            avatar: l.avatar,
            syncedAt: now.toISOString(),
          },
        })
        .run();
    }
  });
}

/** Stored leagues for a user (optionally one season), by name. */
export function readUserLeagues(h: DbHandle, userId: string, season?: number): LeagueChoice[] {
  const where =
    season === undefined
      ? eq(userLeagues.userId, userId)
      : and(eq(userLeagues.userId, userId), eq(userLeagues.season, season));
  return h.db
    .select()
    .from(userLeagues)
    .where(where)
    .orderBy(asc(userLeagues.name), asc(userLeagues.leagueId))
    .all()
    .map((r) => ({
      leagueId: r.leagueId,
      name: r.name,
      season: r.season,
      totalRosters: r.totalRosters,
      status: r.status,
      avatar: r.avatar,
    }));
}
