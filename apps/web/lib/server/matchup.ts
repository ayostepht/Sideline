/**
 * SIM-1/SIM-2 (PLAN 5.7, T5.4b): this week's head-to-head simulation for one roster. Loads both
 * rosters' starters, their mode-agnostic "Projected" mean (PROJ-2's weekly median projection) and
 * standard deviation, and either their finished actual points or `not_started`, then calls the
 * pure `simulateMatchup` in `@sideline/core` and maps the result to the `MatchupResponse` DTO.
 * Cached in `computed_cache` keyed by a hash of the sync jobs that could change the answer
 * (rosters, stats, projections), matching `lineup.ts`'s and `waivers.ts`'s house pattern.
 *
 * **Finished vs. not_started, and why there is no `in_progress` here:** this codebase has no
 * live game-clock or play-by-play feed (ADR-006: no red-zone touches, no live scoring signal).
 * The only real, available signal is whether `player_week_stats` has a recorded row for the
 * requested week, surfaced here via `league_player_week_points.actual_pts` (populated by the
 * worker's `league-points` recompute hook exactly when a stats row exists for that player-week,
 * see `apps/worker/src/recompute-hooks/league-points.ts`). A player with a recorded row is
 * `finished` (their actual points are fixed, never redrawn); a player without one is
 * `not_started` (drawn from their projection distribution). `simulateMatchup`'s `in_progress`
 * branch requires a `fractionOfGameRemaining` signal this codebase cannot honestly produce, so it
 * is never used here - that would mean fabricating a signal, not a real simplification.
 *
 * No analytics logic lives here: every scoring/variance/simulation decision is delegated to
 * `@sideline/core` (`weeklyStandardDeviation`, `simulateMatchup`). This module only loads inputs
 * from SQLite, shapes them into those functions' input types, and maps the output to the DTO.
 */
import { createHash } from "node:crypto";
import {
  simulateMatchup,
  weeklyStandardDeviation,
  type SimStarter,
  type SimTeam,
} from "@sideline/core";
import {
  getComputed,
  getSleeperUserId,
  lastSuccessAt,
  putComputed,
  readNflState,
  readPlayers,
  type DbHandle,
} from "@sideline/db";
import {
  computeFreshness,
  MatchupResponseSchema,
  SYNC_CADENCE_MS,
  type GameWeather,
  type MatchupResponse,
} from "@sideline/shared";
import { z } from "zod";
import { getStandings } from "./league-views.js";
import {
  opponentRosterIdFor,
  readByeWeeks,
  readHistory,
  readPositionCv,
  readProjections,
  toNflverseTeam,
} from "./lineup-inputs.js";
import { weatherByGame, type WeatherGameRef } from "./weather.js";

export type Lookup<T> =
  { ok: true; data: T } | { ok: false; reason: "not_found" | "no_team" | "no_opponent" };

export interface MatchupGetRequest {
  week?: number;
  rosterId?: number;
}

const StringList = z.array(z.string());

function parseList(raw: string): string[] {
  try {
    const r = StringList.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

interface MatchupLeagueRow {
  season: number;
}

function readLeague(h: DbHandle, leagueId: string): MatchupLeagueRow | null {
  const row = h.sqlite.prepare(`SELECT season FROM leagues WHERE league_id = ?`).get(leagueId) as
    MatchupLeagueRow | undefined;
  return row ?? null;
}

interface MatchupRosterRow {
  starters_json: string;
}

function readRosterRow(h: DbHandle, leagueId: string, rosterId: number): MatchupRosterRow | null {
  const row = h.sqlite
    .prepare(`SELECT starters_json FROM rosters WHERE league_id = ? AND roster_id = ?`)
    .get(leagueId, rosterId) as MatchupRosterRow | undefined;
  return row ?? null;
}

/** This week's starters for a roster, Sleeper's "0" empty-slot placeholder excluded. */
function readStarters(h: DbHandle, leagueId: string, rosterId: number): string[] {
  const row = readRosterRow(h, leagueId, rosterId);
  if (row === null) return [];
  return parseList(row.starters_json).filter((id) => id !== "0");
}

/**
 * Each player's actual points for exactly `week`, present only when `player_week_stats` (and so
 * `league_player_week_points.actual_pts`) has a recorded row for them - this module's "finished"
 * signal. See the module doc comment for why no `in_progress` state is ever produced.
 */
function readWeekActuals(
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
      `SELECT player_id AS playerId, actual_pts AS actualPts FROM league_player_week_points
       WHERE league_id = ? AND season = ? AND week = ? AND actual_pts IS NOT NULL
         AND player_id IN (${marks})`,
    )
    .all(leagueId, season, week, ...playerIds) as { playerId: string; actualPts: number }[];
  for (const r of rows) out.set(r.playerId, r.actualPts);
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

/**
 * A small, fast, non-cryptographic string hash (FNV-1a, 32-bit) turning `leagueId`/`week`/
 * `rosterId` into the numeric seed `simulateMatchup` requires (CLAUDE.md section 8: RNG seeds are
 * always passed in by the caller, never generated internally). Deterministic: the same inputs
 * always produce the same seed, and so (via `createRng`) the same simulated distribution -
 * required for the response to be cacheable and for tests to assert exact reproducibility.
 */
function deriveSeed(leagueId: string, week: number, rosterId: number): number {
  const payload = `${leagueId}:${String(week)}:${String(rosterId)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Builds one starter's simulation input: mean/sd from PROJ-2, finished/not_started from whether
 * a stats row exists for this exact week (see module doc comment).
 *
 * A starter whose NFL team is on a bye for the requested week is forced to `finished` with
 * `actualPointsSoFar: 0` ahead of the stats-row check: they have no stats row (never will, for
 * this week), so without this they'd fall through to `not_started` carrying whatever nonzero `sd`
 * their pre-bye weekly history produces - a truncated-normal draw with a nonzero spread for a
 * player mathematically guaranteed to score exactly 0. Mirrors `lineup.ts`'s
 * `readByeWeeks`/`applyAvailability` convention (code-reviewer Major finding, fix round after
 * T5.4b). */
function buildStarter(
  playerId: string,
  projections: Map<string, number>,
  history: Map<string, number[]>,
  positionCv: Map<string, number>,
  positionOf: Map<string, string | null>,
  actuals: Map<string, number>,
  isBye: boolean,
): SimStarter {
  if (isBye) {
    return { playerId, mean: 0, sd: 0, status: "finished", actualPointsSoFar: 0 };
  }
  const proj = projections.get(playerId) ?? 0;
  const weeklyPoints = history.get(playerId) ?? [];
  const position = positionOf.get(playerId) ?? null;
  const cv = position !== null ? (positionCv.get(position) ?? 0) : 0;
  const { sd } = weeklyStandardDeviation({ weeklyPoints, positionCv: cv, proj });
  const actual = actuals.get(playerId);
  if (actual !== undefined) {
    return { playerId, mean: proj, sd, status: "finished", actualPointsSoFar: actual };
  }
  return { playerId, mean: proj, sd, status: "not_started" };
}

/** This week's games keyed by nflverse team code (both sides point at the same game). */
function readWeekGames(h: DbHandle, season: number, week: number): Map<string, WeatherGameRef> {
  const rows = h.sqlite
    .prepare(
      `SELECT game_id AS gameId, home, away, kickoff_utc AS kickoffUtc
       FROM schedule WHERE season = ? AND week = ?`,
    )
    .all(season, week) as {
    gameId: string;
    home: string;
    away: string;
    kickoffUtc: string | null;
  }[];
  const out = new Map<string, WeatherGameRef>();
  for (const r of rows) {
    const ref = { gameId: r.gameId, week, kickoffUtc: r.kickoffUtc };
    out.set(r.home, ref);
    out.set(r.away, ref);
  }
  return out;
}

/**
 * SIM-1/SIM-2: this week's simulated head-to-head matchup for one roster. `now` is injected for
 * freshness and test determinism, matching `getLineup`'s convention.
 */
export function getMatchup(
  h: DbHandle,
  leagueId: string,
  request: MatchupGetRequest,
  now: Date,
): Lookup<MatchupResponse> {
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

  const kind = `matchup-sim:${rosterId}`;
  const inputsHash = inputsHashFor(h, now);
  const cached = getComputed(h, { leagueId, week, kind, inputsHash });
  if (cached !== null) {
    const parsed = MatchupResponseSchema.safeParse(cached);
    if (parsed.success) return { ok: true, data: parsed.data };
    // Fall through to a fresh computation if a cached payload somehow fails validation.
  }

  if (readRosterRow(h, leagueId, rosterId) === null) return { ok: false, reason: "not_found" };

  const opponentRosterId = opponentRosterIdFor(h, leagueId, week, rosterId);
  if (opponentRosterId === null) return { ok: false, reason: "no_opponent" };
  if (readRosterRow(h, leagueId, opponentRosterId) === null) {
    return { ok: false, reason: "not_found" };
  }

  const standings = getStandings(h, leagueId, now);
  if (!standings.ok) return { ok: false, reason: "not_found" };
  const teamNameOf = new Map(standings.data.rows.map((r) => [r.rosterId, r.teamName] as const));

  const myStarters = readStarters(h, leagueId, rosterId);
  const oppStarters = readStarters(h, leagueId, opponentRosterId);
  const allIds = [...new Set([...myStarters, ...oppStarters])];

  const projections = readProjections(h, leagueId, league.season, week, allIds);
  const history = readHistory(h, leagueId, league.season, week, allIds);
  const positionCv = readPositionCv(h, leagueId, league.season);
  const actuals = readWeekActuals(h, leagueId, league.season, week, allIds);
  const players = readPlayers(h, allIds);
  const positionOf = new Map(players.map((p) => [p.playerId, p.position] as const));
  const teamOf = new Map(players.map((p) => [p.playerId, p.team] as const));
  const nameOf = new Map(players.map((p) => [p.playerId, p.fullName] as const));
  const byes = readByeWeeks(h, league.season);

  const toStarter = (playerId: string): SimStarter => {
    const team = teamOf.get(playerId) ?? null;
    const isBye = team !== null && byes.get(team) === week;
    return buildStarter(playerId, projections, history, positionCv, positionOf, actuals, isBye);
  };

  const teamA: SimTeam = { rosterId: String(rosterId), starters: myStarters.map(toStarter) };
  const teamB: SimTeam = {
    rosterId: String(opponentRosterId),
    starters: oppStarters.map(toStarter),
  };

  // WX-4: forecast per starter's game, context only (never enters the sim). One batched read.
  const gameOfTeam = readWeekGames(h, league.season, week);
  const weather = weatherByGame(h, league.season, [...gameOfTeam.values()], now);
  const weatherOf = (playerId: string): GameWeather | null => {
    const team = teamOf.get(playerId) ?? null;
    if (team === null) return null;
    const game = gameOfTeam.get(toNflverseTeam(team));
    return game === undefined ? null : (weather.get(game.gameId) ?? null);
  };

  const seed = deriveSeed(leagueId, week, rosterId);
  const sim = simulateMatchup({ teamA, teamB, seed });

  const response: MatchupResponse = MatchupResponseSchema.parse({
    leagueId,
    week,
    team: {
      rosterId,
      teamName: teamNameOf.get(rosterId) ?? `Team ${rosterId}`,
      p10: sim.teamA.p10,
      p50: sim.teamA.p50,
      p90: sim.teamA.p90,
    },
    opponent: {
      rosterId: opponentRosterId,
      teamName: teamNameOf.get(opponentRosterId) ?? `Team ${opponentRosterId}`,
      p10: sim.teamB.p10,
      p50: sim.teamB.p50,
      p90: sim.teamB.p90,
    },
    winProbability: sim.winProbabilityTeamA,
    opponentWinProbability: sim.winProbabilityTeamB,
    tieProbability: sim.tieProbability,
    swingPlayers: sim.swingPlayers.map((s) => ({
      playerId: s.playerId,
      name: nameOf.get(s.playerId) ?? s.playerId,
      rosterId: Number(s.rosterId),
      varianceContribution: s.varianceContribution,
      nflTeam: teamOf.get(s.playerId) ?? null,
      position: positionOf.get(s.playerId) ?? null,
      weather: weatherOf(s.playerId),
    })),
    freshness: computeFreshness(
      lastSuccessAt(h, "rosters"),
      SYNC_CADENCE_MS.rosters,
      now.getTime(),
    ),
  });

  putComputed(h, { leagueId, week, kind, inputsHash }, response, now);
  return { ok: true, data: response };
}
