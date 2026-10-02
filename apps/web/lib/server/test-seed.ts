import { schema, type DbHandle } from "@sideline/db";

export const SEED_NOW = new Date("2026-10-02T12:00:00.000Z");
const ISO = "2026-10-02T11:00:00.000Z";
const POSITIONS = ["QB", "RB", "WR", "TE"];

export interface SeedOptions {
  leagueId?: string;
  season?: number;
  rosterCount?: number;
  rosterSize?: number;
  playerCount?: number;
  /** Seeds a full 18-week schedule for 32 teams with one bye each. */
  schedule?: boolean;
  rosterPositions?: string[];
  divisions?: number | null;
}

/** Synthetic league for tests: fake names only. Players are p1..pN; roster i owns a block of ids. */
export function seedLeague(h: DbHandle, opts: SeedOptions = {}): void {
  const leagueId = opts.leagueId ?? "L1";
  const season = opts.season ?? 2026;
  const rosterCount = opts.rosterCount ?? 4;
  const rosterSize = opts.rosterSize ?? 8;
  const playerCount = opts.playerCount ?? 60;
  const positions = opts.rosterPositions ?? ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN", "IR"];
  h.db
    .insert(schema.leagues)
    .values({
      leagueId,
      season,
      name: "Test League",
      status: "in_season",
      settingsJson: "{}",
      scoringJson: "{}",
      rosterPositionsJson: JSON.stringify(positions),
      totalRosters: rosterCount,
      playoffWeekStart: 15,
      waiverType: 0,
      divisions: opts.divisions ?? null,
      syncedAt: ISO,
    })
    .run();
  h.db
    .insert(schema.nflState)
    .values({
      id: 1,
      season,
      week: 5,
      seasonType: "regular",
      displayWeek: 5,
      leg: 5,
      fetchedAt: ISO,
    })
    .run();
  const players: (typeof schema.players.$inferInsert)[] = [];
  for (let n = 1; n <= playerCount; n += 1) {
    players.push({
      playerId: `p${n}`,
      fullName: `Player Number${n}`,
      firstName: "Player",
      lastName: `Number${n}`,
      position: POSITIONS[n % 4] ?? "QB",
      fantasyPositionsJson: JSON.stringify([POSITIONS[n % 4] ?? "QB"]),
      team: `T${String((n % 32) + 1).padStart(2, "0")}`,
      searchRank: n,
      updatedAt: ISO,
    });
  }
  h.db.transaction((tx) => {
    for (const p of players) tx.insert(schema.players).values(p).run();
    for (let i = 1; i <= rosterCount; i += 1) {
      const ids = Array.from({ length: rosterSize }, (_, k) => `p${(i - 1) * rosterSize + k + 1}`);
      const starterCount = positions.filter((p) => !["BN", "IR", "TAXI"].includes(p)).length;
      tx.insert(schema.leagueUsers)
        .values({
          leagueId,
          userId: `u${i}`,
          displayName: `Manager ${i}`,
          teamName: i % 2 === 0 ? `Team Name ${i}` : null,
        })
        .run();
      tx.insert(schema.rosters)
        .values({
          leagueId,
          rosterId: i,
          ownerId: `u${i}`,
          playersJson: JSON.stringify(ids),
          startersJson: JSON.stringify(ids.slice(0, starterCount)),
          reserveJson: "[]",
          taxiJson: "[]",
          wins: i % 3,
          losses: 3 - (i % 3),
          fpts: 100 + i,
          fptsAgainst: 90 + i,
          syncedAt: ISO,
        })
        .run();
    }
    if (opts.schedule === true) {
      for (let w = 1; w <= 18; w += 1) {
        const active = Array.from({ length: 32 }, (_, k) => k + 1).filter(
          (t) => 5 + (Math.floor((t - 1) / 2) % 9) !== w,
        );
        for (let g = 0; g + 1 < active.length; g += 2) {
          const home = `T${String(active[g]).padStart(2, "0")}`;
          const away = `T${String(active[g + 1]).padStart(2, "0")}`;
          tx.insert(schema.schedule)
            .values({
              season,
              week: w,
              gameId: `${w}_${home}_${away}`,
              gameType: "REG",
              home,
              away,
            })
            .run();
        }
      }
    }
  });
}
