/**
 * Readers shared by `lineup.ts` and `matchup.ts` (P7b.7f): extracted so the two modules no longer
 * import each other. Behavior is unchanged from when these lived in `lineup.ts`.
 */
import type { DbHandle } from "@sideline/db";

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Bye week per team: the one week in 1..18 where the team is absent (only with all 18 weeks
 * loaded). Exported for T5.4b's matchup simulation fix round: a byed starter must be forced to a
 * fixed, zero-variance 0 rather than drawn from `weeklyStandardDeviation`'s (possibly nonzero)
 * `sd` for a week they are mathematically guaranteed not to play (see `matchup.ts`'s `buildStarter`). */
export function readByeWeeks(h: DbHandle, season: number): Map<string, number> {
  const rows = h.sqlite
    .prepare("SELECT week, home, away FROM schedule WHERE season = ? AND week BETWEEN 1 AND 18")
    .all(season) as { week: number; home: string; away: string }[];
  const allWeeks = new Set<number>();
  const byTeam = new Map<string, Set<number>>();
  for (const r of rows) {
    allWeeks.add(r.week);
    for (const t of [r.home, r.away]) {
      const set = byTeam.get(t) ?? new Set<number>();
      set.add(r.week);
      byTeam.set(t, set);
    }
  }
  const out = new Map<string, number>();
  if (allWeeks.size < 18) return out;
  for (const [team, weeks] of byTeam) {
    const absent = [...allWeeks].filter((w) => !weeks.has(w));
    if (absent.length === 1 && absent[0] !== undefined) out.set(team, absent[0]);
  }
  return out;
}

/**
 * Minimum number of a player's own weekly `actual_pts` samples required before their own
 * coefficient of variation can contribute to {@link readPositionCv}'s position average.
 *
 * Lowered from 4 to 2 (follow-up to the T3.8a/352af52 pooling fix, found by ux-reviewer at the
 * real app's week 4 the same day): population sd of a *single* sample is always exactly 0 and
 * carries no variability signal at all, so 1 week never qualifies. But sd of *two* samples is
 * already nonzero whenever the two differ - the common case for real weekly fantasy scores - so
 * 2 is the lowest threshold that still means something for an individual player's own estimate.
 *
 * 4's original rationale ("one or two noisy weeks would dominate the average") conflated two
 * different noise sources: a single player's own CV estimate from 2-3 weeks is indeed noisy, but
 * {@link MIN_PLAYERS_FOR_POSITION_CV} below controls for exactly that by requiring breadth
 * (several independent players) before the position-level average is trusted at all - which is
 * the right lever, since averaging many independent noisy-but-unbiased per-player estimates
 * reduces the aggregate's variance even though each individual contribution is itself noisy.
 * Requiring 4 weeks *per player* instead left a realistic week-4 league (where most rostered
 * players have at most 1-3 of their own weeks so far) with literally zero qualifying players at
 * any position, collapsing `readPositionCv`'s map to empty and, via the caller's `?? 0` fallback
 * and `weeklyStandardDeviation`'s shrinkage formula, every player's `sd` to exactly 0 - erasing
 * all Safe/Upside separation from Projected for the entire league.
 */
const MIN_WEEKS_FOR_PLAYER_CV = 2;

/**
 * Minimum number of qualifying players (each with at least {@link MIN_WEEKS_FOR_PLAYER_CV} of
 * their own weekly samples) required before a position's averaged CV is trusted at all. This is
 * the breadth lever described above: one qualifying player's own CV, even on its own, is a single
 * noisy point estimate and must never single-handedly set a position's prior when there's no one
 * else to average it against. 2 is the lowest value for which "averaged alongside other players"
 * is literally true; below it there is no averaging happening at all.
 */
const MIN_PLAYERS_FOR_POSITION_CV = 2;

/**
 * Position-level coefficient of variation prior for PROJ-2's shrinkage formula
 * (`weeklyStandardDeviation`): the average, across qualifying players at a position, of each
 * player's OWN week-to-week CV (that player's own sd / mean over their own weekly `actual_pts`).
 *
 * This is deliberately NOT computed by pooling every player's weekly points into one flat list
 * and taking that list's sd / mean. Pooling conflates between-player dispersion (a star RB
 * scoring 20+ next to a deep-bench RB scoring 1-2, every week) with the within-player variability
 * PROJ-2 actually needs as a shrinkage prior for a low-sample player, and produces a CV far
 * larger than any individual player's real week-to-week swing - inflating `sd` in
 * `weeklyStandardDeviation` enough to collapse `floorAndCeiling`'s floor to 0 for most low-sample
 * players (found in T3.8a frontend QA against the fixture DB; see `lineup.test.ts`).
 */
/** Exported for T5.4b's matchup simulation data function, which needs the identical shrinkage
 * prior `getLineup`'s Safe/Upside modes use (see this function's own doc comment for why). */
export function readPositionCv(h: DbHandle, leagueId: string, season: number): Map<string, number> {
  const rows = h.sqlite
    .prepare(
      `SELECT p.position AS position, lpwp.player_id AS playerId, lpwp.actual_pts AS actualPts
       FROM league_player_week_points lpwp
       JOIN players p ON p.player_id = lpwp.player_id
       WHERE lpwp.league_id = ? AND lpwp.season = ? AND lpwp.actual_pts IS NOT NULL`,
    )
    .all(leagueId, season) as { position: string | null; playerId: string; actualPts: number }[];

  const byPositionPlayer = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    if (r.position === null) continue;
    const byPlayer = byPositionPlayer.get(r.position) ?? new Map<string, number[]>();
    const arr = byPlayer.get(r.playerId) ?? [];
    arr.push(r.actualPts);
    byPlayer.set(r.playerId, arr);
    byPositionPlayer.set(r.position, byPlayer);
  }

  const out = new Map<string, number>();
  for (const [position, byPlayer] of byPositionPlayer) {
    const perPlayerCvs: number[] = [];
    for (const values of byPlayer.values()) {
      // Too few of this player's own weeks to estimate their own CV meaningfully; skip rather
      // than let one or two noisy samples dominate the position average.
      if (values.length < MIN_WEEKS_FOR_PLAYER_CV) continue;
      const m = mean(values);
      if (m === 0) continue; // Same divide-by-zero guard as before, applied per player now.
      const variance = mean(values.map((v) => (v - m) ** 2));
      perPlayerCvs.push(Math.sqrt(variance) / m);
    }
    // Fewer than MIN_PLAYERS_FOR_POSITION_CV qualifying players: no breadth to average across,
    // so leave the position out rather than trust a single noisy point estimate alone. The
    // caller already treats a missing entry as 0 via `?? 0`.
    if (perPlayerCvs.length < MIN_PLAYERS_FOR_POSITION_CV) continue;
    out.set(position, mean(perPlayerCvs));
  }
  return out;
}

/** Exported for T5.4b's matchup simulation data function, which needs this week's median
 * projection per starter (the same lookup `getLineup`'s "projected" mode uses). */
export function readProjections(
  h: DbHandle,
  leagueId: string,
  season: number,
  week: number,
  playerIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (playerIds.length === 0) return out;
  const marks = playerIds.map(() => "?").join(",");
  const rows = h.sqlite
    .prepare(
      `SELECT player_id AS playerId, proj_pts AS projPts FROM league_player_week_points
       WHERE league_id = ? AND season = ? AND week = ? AND proj_pts IS NOT NULL
         AND player_id IN (${marks})`,
    )
    .all(leagueId, season, week, ...playerIds) as { playerId: string; projPts: number }[];
  for (const r of rows) out.set(r.playerId, r.projPts);
  return out;
}

/** Each eligible player's actual points for weeks strictly before `week` (for variance/floor-ceiling).
 * Exported for T5.4b's matchup simulation data function, which feeds the same history into
 * `weeklyStandardDeviation` for its own starters. */
export function readHistory(
  h: DbHandle,
  leagueId: string,
  season: number,
  week: number,
  playerIds: string[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (playerIds.length === 0) return out;
  const marks = playerIds.map(() => "?").join(",");
  const rows = h.sqlite
    .prepare(
      `SELECT player_id AS playerId, actual_pts AS actualPts FROM league_player_week_points
       WHERE league_id = ? AND season = ? AND week < ? AND actual_pts IS NOT NULL
         AND player_id IN (${marks})`,
    )
    .all(leagueId, season, week, ...playerIds) as { playerId: string; actualPts: number }[];
  for (const r of rows) {
    const arr = out.get(r.playerId) ?? [];
    arr.push(r.actualPts);
    out.set(r.playerId, arr);
  }
  return out;
}

/** Exported for T5.4b's matchup simulation data function, which needs the identical matchup-id
 * pairing logic to find who a roster is playing this week. */
export function opponentRosterIdFor(
  h: DbHandle,
  leagueId: string,
  week: number,
  rosterId: number,
): number | null {
  const mine = h.sqlite
    .prepare(
      `SELECT matchup_id AS matchupId FROM matchups WHERE league_id = ? AND week = ? AND roster_id = ?`,
    )
    .get(leagueId, week, rosterId) as { matchupId: number | null } | undefined;
  if (mine === undefined || mine.matchupId === null) return null;
  const other = h.sqlite
    .prepare(
      `SELECT roster_id AS rosterId FROM matchups
       WHERE league_id = ? AND week = ? AND matchup_id = ? AND roster_id != ?`,
    )
    .get(leagueId, week, mine.matchupId, rosterId) as { rosterId: number } | undefined;
  return other?.rosterId ?? null;
}

/** Sleeper uses `LAR`; nflverse (`schedule`, `defense_vs_position`) uses `LA`. */
export function toNflverseTeam(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}
