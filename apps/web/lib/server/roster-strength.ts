/**
 * T5.4d (PLAN 5.8): rest-of-season (ROS) optimal lineup roster strength, for every roster in a
 * league. Supplies the per-team "how strong is this roster for the rest of the season" input that
 * LEAGUE-3 (power score's roster-strength component) and LEAGUE-4 (the positional strength
 * heatmap) need; LEAGUE-5's playoff odds also wants a per-team mean weekly score, which
 * `rosOptimalTotal / weeksRemaining` gives a caller for free. This module does not call
 * `power-score.ts` or `positional-heatmap.ts` itself - a later task (T5.4c) wires this output into
 * both.
 *
 * This is NOT `lineup.ts`'s `getLineup`: that optimizes ONE WEEK's lineup from that week's
 * projection. Here, each eligible player's value fed to the SAME pure optimizer
 * (`recommendLineup`, `@sideline/core`) is their full rest-of-season total
 * (`restOfSeasonProjection`, PROJ-4): each remaining week's already-rescored base projection
 * (`league_player_week_points.proj_pts`) when available, falling back to the player's season
 * points-per-game average per week (`ROS_ESTIMATED_FROM_PPG`) otherwise.
 *
 * ## Simplifications for a season-long (not this-week) value
 * `recommendLineup`'s availability/lock/kickoff machinery answers "who should start THIS week"
 * (is this player out, has their game already kicked off). None of that is meaningful for "how
 * good is this roster over the whole rest of the season", so every player is passed in as fully
 * available and unlocked: `status: null`, `isBye: false`, `kickoffUtc: null`,
 * `kickoffApproximate: false`. This also means `applyAvailability` never zeroes or discounts a
 * player's value here (a real concern for a single week, e.g. a player who is "Out" this week but
 * will play most of the rest of the season), and `isLocked` is always false (no slot or player is
 * ever excluded from the solver on lock grounds). `currentAssignment` is passed as all-null (no
 * "current ROS lineup" concept exists); this only affects `recommendLineup`'s `swaps`/
 * `pointDelta`/`issues` outputs, none of which this module reads - only `optimalAssignment` is
 * used, and it is unaffected by `currentAssignment`'s content.
 *
 * ## Position grouping (LEAGUE-4 input shape)
 * `byPosition` sums by the SLOT's type (e.g. `FLEX`, not whichever position the player who filled
 * it happens to list), one entry per distinct slot type in the league's `roster_positions`. Every
 * fillable slot (from `resolveSlots`, i.e. excluding `BN`/`IR`/`TAXI`) is assigned to exactly one
 * bucket, so `byPosition` sums always add up to `rosOptimalTotal` exactly, with no exclusions: an
 * unfillable slot (no eligible player for it) contributes 0 to its bucket, same as to the total.
 * Every slot type present in the league's `roster_positions` appears in `byPosition` even when no
 * player ever fills it (value 0), so every roster's result has the same set of position keys -
 * needed for `computePositionalHeatmap`'s cross-team median to compare apples to apples.
 *
 * ## Caching
 * Expensive (one optimizer solve per roster): cached in `computed_cache` for the whole league at
 * once, keyed by `kind = "roster-strength"` (no per-roster suffix needed; `leagueId` is already
 * its own column in `computed_cache`) and `week = 0` (a sentinel - this result is not scoped to
 * one week, it spans the rest of the season), invalidated by the same rosters/stats/projections/
 * state sync timestamps `lineup.ts`/`waivers.ts` already use for their own cache keys.
 */
import { createHash } from "node:crypto";
import {
  DEFAULT_SEASON_WEEKS,
  recommendLineup,
  resolveSlots,
  restOfSeasonProjection,
  type RecommendLineupPlayer,
  type RestOfSeasonWeek,
} from "@sideline/core";
import {
  getComputed,
  lastSuccessAt,
  putComputed,
  readNflState,
  readPlayers,
  type DbHandle,
  type FullPlayerRow,
} from "@sideline/db";
import { z } from "zod";

export type Lookup<T> = { ok: true; data: T } | { ok: false; reason: "not_found" };

const StringList = z.array(z.string());

function parseList(raw: string): string[] {
  try {
    const r = StringList.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface RosterStrengthPositionEntry {
  position: string;
  value: number;
}

export interface RosterStrengthResult {
  rosterId: number;
  rosOptimalTotal: number;
  byPosition: RosterStrengthPositionEntry[];
}

const RosterStrengthResultSchema = z.strictObject({
  rosterId: z.number().int(),
  rosOptimalTotal: z.number(),
  byPosition: z.array(z.strictObject({ position: z.string(), value: z.number() })),
});
const RosterStrengthResultsSchema = z.array(RosterStrengthResultSchema);

interface RosterStrengthLeagueRow {
  league_id: string;
  season: number;
  roster_positions_json: string;
}

function readLeague(h: DbHandle, leagueId: string): RosterStrengthLeagueRow | null {
  const row = h.sqlite
    .prepare(`SELECT league_id, season, roster_positions_json FROM leagues WHERE league_id = ?`)
    .get(leagueId) as RosterStrengthLeagueRow | undefined;
  return row ?? null;
}

interface RosterStrengthRosterRow {
  roster_id: number;
  players_json: string;
  reserve_json: string;
  taxi_json: string;
}

function readRosters(h: DbHandle, leagueId: string): RosterStrengthRosterRow[] {
  return h.sqlite
    .prepare(
      `SELECT roster_id, players_json, reserve_json, taxi_json FROM rosters WHERE league_id = ?`,
    )
    .all(leagueId) as RosterStrengthRosterRow[];
}

interface PointsCell {
  actualPts: number | null;
  projPts: number | null;
}

/** Every league-scored points row for a league/season, grouped by player then week. Mirrors
 * `waivers.ts`'s own `readLeaguePoints`: one unfiltered scan of the (per-league) table rather than
 * a chunked `IN (...)` per roster, since every roster's eligible players need this data anyway. */
function readLeaguePoints(
  h: DbHandle,
  leagueId: string,
  season: number,
): Map<string, Map<number, PointsCell>> {
  const rows = h.sqlite
    .prepare(
      `SELECT player_id AS playerId, week, actual_pts AS actualPts, proj_pts AS projPts
       FROM league_player_week_points WHERE league_id = ? AND season = ?`,
    )
    .all(leagueId, season) as {
    playerId: string;
    week: number;
    actualPts: number | null;
    projPts: number | null;
  }[];
  const out = new Map<string, Map<number, PointsCell>>();
  for (const r of rows) {
    const byWeek = out.get(r.playerId) ?? new Map<number, PointsCell>();
    byWeek.set(r.week, { actualPts: r.actualPts, projPts: r.projPts });
    out.set(r.playerId, byWeek);
  }
  return out;
}

/** This player's ROS value (PROJ-4): sums `proj_pts` for each week from `currentWeek` through
 * {@link DEFAULT_SEASON_WEEKS}, falling back to their season points-per-game (mean `actual_pts`
 * for weeks strictly before `currentWeek`) for any week with no stored projection. */
function rosValueFor(byWeek: Map<number, PointsCell> | undefined, currentWeek: number): number {
  const history: number[] = [];
  if (byWeek !== undefined) {
    for (const [week, cell] of byWeek) {
      if (week < currentWeek && cell.actualPts !== null) history.push(cell.actualPts);
    }
  }
  const seasonPpg = history.length > 0 ? mean(history) : null;
  const weeks: RestOfSeasonWeek[] = [];
  for (let w = currentWeek; w <= DEFAULT_SEASON_WEEKS; w += 1) {
    weeks.push({ week: w, projectedPoints: byWeek?.get(w)?.projPts ?? null });
  }
  return restOfSeasonProjection({ weeks, seasonPpg }).points;
}

function inputsHashFor(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    state: lastSuccessAt(h, "state"),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * LEAGUE-3/LEAGUE-4's ROS optimal lineup roster strength input, one entry per roster in the
 * league. See the module doc for the ROS-value math, the availability/lock simplifications, the
 * position-grouping convention, and the caching key. A league with no rosters yet (e.g. not fully
 * synced) returns `{ ok: true, data: [] }` rather than an error, since this is a normal transient
 * state, not a failure; a nonexistent league returns `not_found`.
 */
export function getRosterStrength(
  h: DbHandle,
  leagueId: string,
  now: Date,
): Lookup<RosterStrengthResult[]> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };

  const kind = "roster-strength";
  const week = 0; // Sentinel: this result spans the rest of the season, not one week.
  const inputsHash = inputsHashFor(h);
  const cached = getComputed(h, { leagueId, week, kind, inputsHash });
  if (cached !== null) {
    const parsed = RosterStrengthResultsSchema.safeParse(cached);
    if (parsed.success) return { ok: true, data: parsed.data };
    // Fall through to a fresh computation if a cached payload somehow fails validation.
  }

  const rosterRows = readRosters(h, leagueId);
  if (rosterRows.length === 0) {
    const empty: RosterStrengthResult[] = [];
    putComputed(h, { leagueId, week, kind, inputsHash }, empty, now);
    return { ok: true, data: empty };
  }

  // Clamp to a sane 1..DEFAULT_SEASON_WEEKS range: an unknown NFL state defaults to "the whole
  // season remains" rather than crashing or silently producing zero weeks.
  const rawWeek = readNflState(h)?.week ?? 1;
  const currentWeek = Math.min(Math.max(rawWeek, 1), DEFAULT_SEASON_WEEKS);

  const rosterPositions = parseList(league.roster_positions_json);
  const { slots, warnings } = resolveSlots(rosterPositions);
  const slotTypes = [...new Set(slots.map((s) => s.slotType))];

  const eligibleByRoster = new Map<number, string[]>();
  const allEligibleIds = new Set<string>();
  for (const row of rosterRows) {
    const eligible = new Set(parseList(row.players_json));
    for (const id of parseList(row.reserve_json)) eligible.delete(id);
    for (const id of parseList(row.taxi_json)) eligible.delete(id);
    eligible.delete("0");
    eligibleByRoster.set(row.roster_id, [...eligible]);
    for (const id of eligible) allEligibleIds.add(id);
  }

  const playersById = new Map<string, FullPlayerRow>(
    readPlayers(h, [...allEligibleIds]).map((p) => [p.playerId, p] as const),
  );
  const points = readLeaguePoints(h, leagueId, league.season);

  const rosValueByPlayer = new Map<string, number>();
  for (const id of allEligibleIds) {
    rosValueByPlayer.set(id, rosValueFor(points.get(id), currentWeek));
  }

  const results: RosterStrengthResult[] = rosterRows.map((row) => {
    const eligibleIds = eligibleByRoster.get(row.roster_id) ?? [];
    const recommendPlayers: RecommendLineupPlayer[] = eligibleIds.map((id) => {
      const p = playersById.get(id);
      return {
        playerId: id,
        fantasyPositions: p?.fantasyPositions ?? [],
        rawValue: rosValueByPlayer.get(id) ?? 0,
        status: null,
        isBye: false,
        kickoffUtc: null,
        kickoffApproximate: false,
      };
    });

    const recommendResult = recommendLineup({
      slots,
      slotWarnings: warnings,
      players: recommendPlayers,
      currentAssignment: slots.map(() => null),
      now,
    });

    const byPosition = new Map<string, number>(slotTypes.map((t) => [t, 0] as const));
    let rosOptimalTotal = 0;
    for (const assignment of recommendResult.optimalAssignment) {
      if (assignment.playerId === null) continue;
      const value = rosValueByPlayer.get(assignment.playerId) ?? 0;
      rosOptimalTotal += value;
      byPosition.set(assignment.slotType, (byPosition.get(assignment.slotType) ?? 0) + value);
    }

    return {
      rosterId: row.roster_id,
      rosOptimalTotal,
      byPosition: slotTypes.map((position) => ({
        position,
        value: byPosition.get(position) ?? 0,
      })),
    };
  });

  const parsed = RosterStrengthResultsSchema.parse(results);
  putComputed(h, { leagueId, week, kind, inputsHash }, parsed, now);
  return { ok: true, data: parsed };
}
