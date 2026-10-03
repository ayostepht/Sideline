/**
 * LINEUP-1..LINEUP-9, MATCH-2/MATCH-4 (PLAN 5.3/5.4, T3.7): assembles one roster's eligible
 * players with their projections, matchup adjustment, and lock status, calls the pure optimizer
 * in `@sideline/core`, and maps the result to the `LineupResponse` DTO. Cached in `computed_cache`
 * keyed by a hash of the sync jobs that could change the answer (rosters, stats, projections).
 *
 * No analytics logic lives here: every scoring/optimizer decision is delegated to `@sideline/core`
 * (`resolveSlots`, `recommendLineup`, `weeklyStandardDeviation`, `floorAndCeiling`,
 * `matchupMultiplier`, `matchupGrade`, `applyAvailability`). This module only loads inputs from
 * SQLite, shapes them into those functions' input types, and maps the output to the DTO.
 */
import { createHash } from "node:crypto";
import {
  applyAvailability,
  DEFAULT_MATCHUP_ADJUSTMENT_CONFIG,
  floorAndCeiling,
  matchupGrade,
  matchupMultiplier,
  recommendLineup,
  resolveSlots,
  weeklyStandardDeviation,
  type MatchupGradeLetter,
  type RecommendLineupPlayer,
} from "@sideline/core";
import {
  getComputed,
  getSleeperUserId,
  lastSuccessAt,
  putComputed,
  readNflState,
} from "@sideline/db";
import type { DbHandle } from "@sideline/db";
import {
  computeFreshness,
  LineupResponseSchema,
  SYNC_CADENCE_MS,
  type LineupMode,
  type LineupPlayer,
  type LineupResponse,
} from "@sideline/shared";
import { z } from "zod";

export type Lookup<T> = { ok: true; data: T } | { ok: false; reason: "not_found" | "no_team" };

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

/** Sleeper uses `LAR`; nflverse (`schedule`, `defense_vs_position`) uses `LA`. */
function toNflverseTeam(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}

interface LineupLeagueRow {
  league_id: string;
  season: number;
  roster_positions_json: string;
}

function readLeague(h: DbHandle, leagueId: string): LineupLeagueRow | null {
  const row = h.sqlite
    .prepare(`SELECT league_id, season, roster_positions_json FROM leagues WHERE league_id = ?`)
    .get(leagueId) as LineupLeagueRow | undefined;
  return row ?? null;
}

interface LineupRosterRow {
  players_json: string;
  starters_json: string;
  reserve_json: string;
  taxi_json: string;
}

function readRoster(h: DbHandle, leagueId: string, rosterId: number): LineupRosterRow | null {
  const row = h.sqlite
    .prepare(
      `SELECT players_json, starters_json, reserve_json, taxi_json
       FROM rosters WHERE league_id = ? AND roster_id = ?`,
    )
    .get(leagueId, rosterId) as LineupRosterRow | undefined;
  return row ?? null;
}

interface LineupPlayerRow {
  player_id: string;
  full_name: string;
  position: string | null;
  fantasy_positions_json: string;
  team: string | null;
  status: string | null;
  injury_status: string | null;
}

function readPlayers(h: DbHandle, ids: string[]): Map<string, LineupPlayerRow> {
  const out = new Map<string, LineupPlayerRow>();
  if (ids.length === 0) return out;
  const marks = ids.map(() => "?").join(",");
  const rows = h.sqlite
    .prepare(
      `SELECT player_id, full_name, position, fantasy_positions_json, team, status, injury_status
       FROM players WHERE player_id IN (${marks})`,
    )
    .all(...ids) as LineupPlayerRow[];
  for (const r of rows) out.set(r.player_id, r);
  return out;
}

/** Bye week per team: the one week in 1..18 where the team is absent (only with all 18 weeks loaded). */
function readByeWeeks(h: DbHandle, season: number): Map<string, number> {
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

interface ScheduleEntry {
  opponent: string;
  kickoffUtc: string | null;
  kickoffApproximate: boolean;
}

/** This week's schedule, keyed by nflverse team code, each side pointing at its opponent. */
function readWeekSchedule(h: DbHandle, season: number, week: number): Map<string, ScheduleEntry> {
  const rows = h.sqlite
    .prepare(
      `SELECT home, away, kickoff_utc AS kickoffUtc, kickoff_approximate AS kickoffApproximate
       FROM schedule WHERE season = ? AND week = ?`,
    )
    .all(season, week) as {
    home: string;
    away: string;
    kickoffUtc: string | null;
    kickoffApproximate: number;
  }[];
  const out = new Map<string, ScheduleEntry>();
  for (const r of rows) {
    const approximate = r.kickoffApproximate !== 0;
    out.set(r.home, {
      opponent: r.away,
      kickoffUtc: r.kickoffUtc,
      kickoffApproximate: approximate,
    });
    out.set(r.away, {
      opponent: r.home,
      kickoffUtc: r.kickoffUtc,
      kickoffApproximate: approximate,
    });
  }
  return out;
}

interface DvpEntry {
  team: string;
  ptsAllowedPg: number;
}

/**
 * Defense-vs-position at the latest `through_week` at or before `week`, keyed by position, each
 * array sorted descending by points allowed (rank 1 = allows the most = easiest matchup, per
 * {@link matchupGrade}'s own doc comment).
 */
function readDefenseVsPosition(
  h: DbHandle,
  leagueId: string,
  season: number,
  week: number,
): Map<string, DvpEntry[]> {
  const through = h.sqlite
    .prepare(
      `SELECT MAX(through_week) AS tw FROM defense_vs_position
       WHERE league_id = ? AND season = ? AND through_week <= ?`,
    )
    .get(leagueId, season, week) as { tw: number | null } | undefined;
  const out = new Map<string, DvpEntry[]>();
  if (through === undefined || through.tw === null) return out;
  const rows = h.sqlite
    .prepare(
      `SELECT team, position, pts_allowed_pg AS ptsAllowedPg FROM defense_vs_position
       WHERE league_id = ? AND season = ? AND through_week = ?`,
    )
    .all(leagueId, season, through.tw) as {
    team: string;
    position: string;
    ptsAllowedPg: number;
  }[];
  for (const r of rows) {
    const arr = out.get(r.position) ?? [];
    arr.push({ team: r.team, ptsAllowedPg: r.ptsAllowedPg });
    out.set(r.position, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => b.ptsAllowedPg - a.ptsAllowedPg);
  return out;
}

/** League-wide coefficient of variation (sd / mean) of actual points per position (PROJ-2 prior). */
function readPositionCv(h: DbHandle, leagueId: string, season: number): Map<string, number> {
  const rows = h.sqlite
    .prepare(
      `SELECT p.position AS position, lpwp.actual_pts AS actualPts
       FROM league_player_week_points lpwp
       JOIN players p ON p.player_id = lpwp.player_id
       WHERE lpwp.league_id = ? AND lpwp.season = ? AND lpwp.actual_pts IS NOT NULL`,
    )
    .all(leagueId, season) as { position: string | null; actualPts: number }[];
  const byPosition = new Map<string, number[]>();
  for (const r of rows) {
    if (r.position === null) continue;
    const arr = byPosition.get(r.position) ?? [];
    arr.push(r.actualPts);
    byPosition.set(r.position, arr);
  }
  const out = new Map<string, number>();
  for (const [position, values] of byPosition) {
    const m = mean(values);
    const variance = mean(values.map((v) => (v - m) ** 2));
    const sd = Math.sqrt(variance);
    out.set(position, m === 0 ? 0 : sd / m);
  }
  return out;
}

function readProjections(
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

/** Each eligible player's actual points for weeks strictly before `week` (for variance/floor-ceiling). */
function readHistory(
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

function opponentRosterIdFor(
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

function inputsHashFor(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
  });
  // A cheap, stable digest; cryptographic strength is not needed, only determinism.
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export interface LineupRequest {
  week?: number;
  mode: LineupMode;
  rosterId?: number;
}

/**
 * LINEUP-6: the full lineup recommendation for one roster. See the module doc for the algorithm
 * and `docs` references. `now` is injected for lock-status determinism in tests.
 */
export function getLineup(
  h: DbHandle,
  leagueId: string,
  request: LineupRequest,
  now: Date,
): Lookup<LineupResponse> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };

  const week = request.week ?? readNflState(h)?.week;
  if (week === undefined) return { ok: false, reason: "not_found" };

  let rosterId: number;
  if (request.rosterId !== undefined) {
    rosterId = request.rosterId;
  } else {
    const userId = getSleeperUserId(h);
    if (userId === null) return { ok: false, reason: "no_team" };
    const mine = h.sqlite
      .prepare(
        "SELECT roster_id AS id FROM rosters WHERE league_id = ? AND owner_id = ? ORDER BY roster_id LIMIT 1",
      )
      .get(leagueId, userId) as { id: number } | undefined;
    if (mine === undefined) return { ok: false, reason: "no_team" };
    rosterId = mine.id;
  }

  const mode = request.mode;
  const kind = `lineup:${mode}:${rosterId}`;
  const inputsHash = inputsHashFor(h);
  const cached = getComputed(h, { leagueId, week, kind, inputsHash });
  if (cached !== null) {
    const parsed = LineupResponseSchema.safeParse(cached);
    if (parsed.success) return { ok: true, data: parsed.data };
    // Fall through to a fresh computation if a cached payload somehow fails validation.
  }

  const rosterRow = readRoster(h, leagueId, rosterId);
  if (rosterRow === null) return { ok: false, reason: "not_found" };

  const eligible = new Set(parseList(rosterRow.players_json));
  for (const id of parseList(rosterRow.reserve_json)) eligible.delete(id);
  for (const id of parseList(rosterRow.taxi_json)) eligible.delete(id);
  eligible.delete("0");
  const eligibleIds = [...eligible];

  const { slots, warnings } = resolveSlots(parseList(league.roster_positions_json));
  const players = readPlayers(h, eligibleIds);
  const byes = readByeWeeks(h, league.season);
  const schedule = readWeekSchedule(h, league.season, week);
  const dvp = readDefenseVsPosition(h, leagueId, league.season, week);
  const positionCv = readPositionCv(h, leagueId, league.season);
  const projections = readProjections(h, leagueId, league.season, week, eligibleIds);
  const history = readHistory(h, leagueId, league.season, week, eligibleIds);

  const recommendPlayers: RecommendLineupPlayer[] = [];
  const matchupInfoByPlayer = new Map<
    string,
    { grade: MatchupGradeLetter | null; label: string | null }
  >();

  for (const playerId of eligibleIds) {
    const p = players.get(playerId);
    const projPts = projections.get(playerId) ?? 0;

    let rawValue: number;
    if (mode === "projected") {
      rawValue = projPts;
    } else {
      const playerHistory = history.get(playerId) ?? [];
      const cv =
        p?.position !== null && p?.position !== undefined ? (positionCv.get(p.position) ?? 0) : 0;
      const sd = weeklyStandardDeviation({
        weeklyPoints: playerHistory,
        positionCv: cv,
        proj: projPts,
      }).sd;
      const fc = floorAndCeiling({ proj: projPts, sd, historicalWeeklyPoints: playerHistory });
      rawValue = mode === "safe" ? fc.floor : fc.ceiling;
    }

    const ownTeam = p?.team ?? null;
    const ownTeamConverted = ownTeam === null ? null : toNflverseTeam(ownTeam);
    const scheduleEntry = ownTeamConverted === null ? undefined : schedule.get(ownTeamConverted);

    let grade: MatchupGradeLetter | null = null;
    let label: string | null = null;
    if (scheduleEntry !== undefined && p?.position !== null && p?.position !== undefined) {
      const posEntries = dvp.get(p.position);
      if (posEntries !== undefined && posEntries.length > 0) {
        const idx = posEntries.findIndex((e) => e.team === scheduleEntry.opponent);
        if (idx !== -1) {
          const dvpOppPos = posEntries[idx]?.ptsAllowedPg ?? 0;
          const avgPos = mean(posEntries.map((e) => e.ptsAllowedPg));
          const { multiplier } = matchupMultiplier({
            dvpOppPos,
            avgPos,
            alpha: DEFAULT_MATCHUP_ADJUSTMENT_CONFIG.alpha,
            beta: DEFAULT_MATCHUP_ADJUSTMENT_CONFIG.beta,
          });
          rawValue *= multiplier;
          const g = matchupGrade(idx + 1, posEntries.length);
          grade = g.grade;
          label = g.label;
        }
      }
    }
    matchupInfoByPlayer.set(playerId, { grade, label });

    const isBye = ownTeam !== null && byes.get(ownTeam) === week;

    recommendPlayers.push({
      playerId,
      fantasyPositions: p === undefined ? [] : parseList(p.fantasy_positions_json),
      rawValue,
      status: p?.injury_status ?? null,
      isBye,
      kickoffUtc: scheduleEntry?.kickoffUtc ?? null,
      kickoffApproximate: scheduleEntry?.kickoffApproximate ?? false,
    });
  }

  const currentAssignment = parseList(rosterRow.starters_json).map((id) =>
    id === "0" ? null : id,
  );

  const recommendResult = recommendLineup({
    slots,
    slotWarnings: warnings,
    players: recommendPlayers,
    currentAssignment,
    now,
  });

  const players_: LineupPlayer[] = recommendPlayers.map((rp) => {
    const p = players.get(rp.playerId);
    const matchupInfo = matchupInfoByPlayer.get(rp.playerId) ?? { grade: null, label: null };
    const reasons = recommendResult.playerReasons[rp.playerId] ?? [];
    const locked = reasons.some((r) => r.code === "LOCKED");
    const availability = applyAvailability({
      status: rp.status,
      isBye: rp.isBye,
      rawValue: rp.rawValue,
    });
    return {
      playerId: rp.playerId,
      name: p?.full_name ?? rp.playerId,
      position: p?.position ?? null,
      nflTeam: p?.team ?? null,
      status: p?.status ?? null,
      injuryStatus: p?.injury_status ?? null,
      byeWeek: p?.team != null ? (byes.get(p.team) ?? null) : null,
      value: availability.value,
      matchupGrade: matchupInfo.grade,
      matchupLabel: matchupInfo.label,
      locked,
      kickoffApproximate: rp.kickoffApproximate,
      reasons: [...reasons],
    };
  });

  const response: LineupResponse = LineupResponseSchema.parse({
    leagueId,
    rosterId,
    week,
    mode,
    optimalAssignment: recommendResult.optimalAssignment,
    currentAssignment: recommendResult.currentAssignment,
    swaps: recommendResult.swaps,
    pointDelta: recommendResult.pointDelta,
    players: players_,
    issues: recommendResult.issues,
    opponentRosterId: opponentRosterIdFor(h, leagueId, week, rosterId),
    freshness: computeFreshness(
      lastSuccessAt(h, "rosters"),
      SYNC_CADENCE_MS.rosters,
      now.getTime(),
    ),
  });

  putComputed(h, { leagueId, week, kind, inputsHash }, response, now);
  return { ok: true, data: response };
}
