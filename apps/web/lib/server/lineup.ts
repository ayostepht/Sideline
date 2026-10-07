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
  SLOT_ELIGIBILITY,
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
  AUTO_SAFE_ABOVE,
  AUTO_UPSIDE_BELOW,
  computeFreshness,
  LineupResponseSchema,
  SYNC_CADENCE_MS,
  type LineupMode,
  type LineupModeChoice,
  type LineupPlayer,
  type LineupResponse,
  type Reason,
} from "@sideline/shared";
import { z } from "zod";
import { getMatchup } from "./matchup.js";
import { weatherByGame, weatherReasons } from "./weather.js";
import {
  opponentRosterIdFor,
  readByeWeeks,
  readHistory,
  readPositionCv,
  readProjections,
  toNflverseTeam,
} from "./lineup-inputs.js";

// Re-exported for existing callers (tests/integration) that import these from `./lineup`.
export { readByeWeeks, readHistory, readPositionCv, readProjections, opponentRosterIdFor };

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

/** `roster_positions` entries that are reserve/bench capacity, absent from Sleeper's `starters`
 * array entirely (mirrors `packages/core/src/optimizer/eligibility.ts`'s own `RESERVE_SLOT_TYPES`,
 * which isn't exported). */
const RESERVE_SLOT_TYPES = new Set(["BN", "IR", "TAXI"]);

/**
 * Builds `currentAssignment` aligned with `resolveSlots`' output. Sleeper's `starters` array has
 * one entry per non-bench `roster_positions` entry, in the same order (docs/sleeper-api-notes.md
 * section on roster fields). `resolveSlots` drops that same set of entries, but ALSO drops any
 * slot type it doesn't recognize (surfaced only as a warning, LINEUP-1) - a type Sleeper itself
 * still lets a user start a player in. Re-applying the identical two-part filter here (reserve
 * types, then known slot types) keeps `currentAssignment` parallel to `slots` even when an
 * unrecognized slot type is present, instead of silently shifting every later slot by one.
 */
function buildCurrentAssignment(
  rosterPositions: readonly string[],
  starters: string[],
): (string | null)[] {
  const nonBench = rosterPositions.filter((p) => !RESERVE_SLOT_TYPES.has(p));
  const out: (string | null)[] = [];
  nonBench.forEach((slotType, i) => {
    if (!(slotType in SLOT_ELIGIBILITY)) return;
    const id = starters[i];
    out.push(id === undefined || id === "0" ? null : id);
  });
  return out;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export { toNflverseTeam };

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

interface ScheduleEntry {
  gameId: string;
  week: number;
  opponent: string;
  kickoffUtc: string | null;
  kickoffApproximate: boolean;
}

/** This week's schedule, keyed by nflverse team code, each side pointing at its opponent. */
function readWeekSchedule(h: DbHandle, season: number, week: number): Map<string, ScheduleEntry> {
  const rows = h.sqlite
    .prepare(
      `SELECT game_id AS gameId, home, away, kickoff_utc AS kickoffUtc, kickoff_approximate AS kickoffApproximate
       FROM schedule WHERE season = ? AND week = ?`,
    )
    .all(season, week) as {
    gameId: string;
    home: string;
    away: string;
    kickoffUtc: string | null;
    kickoffApproximate: number;
  }[];
  const out = new Map<string, ScheduleEntry>();
  for (const r of rows) {
    const approximate = r.kickoffApproximate !== 0;
    out.set(r.home, {
      gameId: r.gameId,
      week,
      opponent: r.away,
      kickoffUtc: r.kickoffUtc,
      kickoffApproximate: approximate,
    });
    out.set(r.away, {
      gameId: r.gameId,
      week,
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
export function readDefenseVsPosition(
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

function inputsHashFor(h: DbHandle, now: Date): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    weather: lastSuccessAt(h, "weather"),
    // The synthesized "No forecast" window moves with time; re-evaluate every 3 hours.
    weatherWindow: Math.floor(now.getTime() / (3 * 60 * 60 * 1000)),
  });
  // A cheap, stable digest; cryptographic strength is not needed, only determinism.
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Test seam: the win-probability source Auto reads. Defaults to the cached `getMatchup` sim. */
export interface LineupDeps {
  getMatchup?: typeof getMatchup;
}

/**
 * AUTO-1 / ADR-022: pick the concrete mode from the roster's current-starters median win
 * probability. Falls back to `projected` (with `AUTO_FALLBACK`) when there is no usable sim.
 * Reads `getMatchup` only, so the Auto lineup never feeds back into the sim.
 */
function resolveAutoMode(
  h: DbHandle,
  leagueId: string,
  week: number,
  rosterId: number,
  now: Date,
  deps: LineupDeps,
): { mode: LineupMode; reason: Reason } {
  const fallback = (why: string): { mode: LineupMode; reason: Reason } => ({
    mode: "projected",
    reason: { code: "AUTO_FALLBACK", label: `Auto used Projected: ${why}` },
  });
  // getMatchup sims the roster's current Sleeper starters, so only this week is meaningful.
  if (week !== readNflState(h)?.week) return fallback("not the current week");
  const sim = (deps.getMatchup ?? getMatchup)(h, leagueId, { week, rosterId }, now);
  if (!sim.ok) {
    return fallback(sim.reason === "no_opponent" ? "no matchup this week" : "no forecast yet");
  }
  const p = sim.data.winProbability;
  const mode: LineupMode =
    p < AUTO_UPSIDE_BELOW ? "upside" : p > AUTO_SAFE_ABOVE ? "safe" : "projected";
  const name = mode === "upside" ? "Upside" : mode === "safe" ? "Safe" : "Projected";
  return {
    mode,
    reason: {
      code: "AUTO_MODE",
      label: `Auto picked ${name}: ${Math.round(p * 100)}% to win`,
      value: p,
    },
  };
}

export interface LineupRequest {
  week?: number;
  mode: LineupModeChoice;
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
  deps: LineupDeps = {},
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

  const requestedMode = request.mode;
  if (requestedMode === "auto") {
    const auto = resolveAutoMode(h, leagueId, week, rosterId, now, deps);
    // Reuse the concrete mode's cached entry; `auto` itself is never cached, so a changed win
    // probability resolves differently on the next request.
    const concrete = getLineup(h, leagueId, { week, mode: auto.mode, rosterId }, now, deps);
    if (!concrete.ok) return concrete;
    return {
      ok: true,
      data: { ...concrete.data, mode: "auto", resolvedMode: auto.mode, modeReason: auto.reason },
    };
  }
  const mode: LineupMode = requestedMode;
  const modeReason: Reason | null = null;
  const kind = `lineup:${requestedMode}:${rosterId}`;
  const inputsHash = inputsHashFor(h, now);
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

  const rosterPositions = parseList(league.roster_positions_json);
  const { slots, warnings } = resolveSlots(rosterPositions);
  const players = readPlayers(h, eligibleIds);
  const byes = readByeWeeks(h, league.season);
  const schedule = readWeekSchedule(h, league.season, week);
  const dvp = readDefenseVsPosition(h, leagueId, league.season, week);
  const positionCv = readPositionCv(h, leagueId, league.season);
  const projections = readProjections(h, leagueId, league.season, week, eligibleIds);
  const history = readHistory(h, leagueId, league.season, week, eligibleIds);

  const recommendPlayers: RecommendLineupPlayer[] = [];
  const gameByPlayer = new Map<string, ScheduleEntry>();
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
    if (scheduleEntry !== undefined) gameByPlayer.set(playerId, scheduleEntry);

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

  const currentAssignment = buildCurrentAssignment(
    rosterPositions,
    parseList(rosterRow.starters_json),
  );

  const recommendResult = recommendLineup({
    slots,
    slotWarnings: warnings,
    players: recommendPlayers,
    currentAssignment,
    now,
  });

  // WX-4: context only. One batched read; never feeds values or the optimizer.
  const weather = weatherByGame(
    h,
    league.season,
    [...gameByPlayer.values()].map((g) => ({
      gameId: g.gameId,
      week: g.week,
      kickoffUtc: g.kickoffUtc,
    })),
    now,
  );

  const players_: LineupPlayer[] = recommendPlayers.map((rp) => {
    const p = players.get(rp.playerId);
    const matchupInfo = matchupInfoByPlayer.get(rp.playerId) ?? { grade: null, label: null };
    const reasons = recommendResult.playerReasons[rp.playerId] ?? [];
    const locked = reasons.some((r) => r.code === "LOCKED");
    const game = gameByPlayer.get(rp.playerId);
    const gameWeather = game === undefined ? null : (weather.get(game.gameId) ?? null);
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
      weather: gameWeather,
      reasons: [...reasons, ...weatherReasons(gameWeather)],
    };
  });

  const response: LineupResponse = LineupResponseSchema.parse({
    leagueId,
    rosterId,
    week,
    mode: requestedMode,
    resolvedMode: mode,
    modeReason,
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
