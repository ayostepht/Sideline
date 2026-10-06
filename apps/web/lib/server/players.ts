/**
 * T4.5c (PLAN 4.5, TREND-1..5): players list (paginated, filterable) and player detail data
 * functions. Reads come from `@sideline/db`'s generic content reads (`readPlayers`,
 * `readLeaguePlayerWeekPoints`, `readUsageWeek`, `readLeagueWeekPositionRanks`, `readTrending`,
 * T4.5a) and are mapped through `@sideline/core`'s pure trend functions (`computeScoringTrend`,
 * `computeUsageTrend`, `computeConsistency`, `computeTrendSignal`, `computeTrendingMomentum`) and
 * `resolveSlots` (for TREND-3's league-wide startable count). No analytics logic lives here.
 *
 * List vs. detail enrichment (documented per the brief, for T4.6's consumption):
 * - The list computes TREND-1 (`computeScoringTrend`) and TREND-4's points-only signal
 *   (`usageDelta: null`) for the current page's players only, so a page of any size stays cheap:
 *   one `readLeaguePlayerWeekPoints` call per request (not per player), filtered in memory to the
 *   page's ids.
 * - Usage (TREND-2), consistency/boom-bust (TREND-3), and Sleeper momentum (TREND-5) are deferred
 *   to the detail view, where `computeTrendSignal`'s `usageDelta` also becomes available (the
 *   `snapPct` field's delta - the one usage field every tracked position in
 *   `POSITION_USAGE_FIELDS` reports, so it is the representative "usage delta" TREND-4's single
 *   `usageDelta` input expects; PLAN 5.5 does not itself pick one of TREND-2's several fields).
 */
import {
  computeConsistency,
  computeScoringTrend,
  computeTrendingMomentum,
  computeTrendSignal,
  computeUsageTrend,
  resolveSlots,
  type ConsistencyWeek,
  type ScoringWeek,
} from "@sideline/core";
import {
  lastSuccessAt,
  readLeaguePlayerWeekPoints,
  readPlayers as readPlayersDb,
  readPlayerUsageWeeks,
  readPlayerWeekPoints,
  readPlayerWeekPositionRanks,
  readTrending,
  type DbHandle,
  type FullPlayerRow,
} from "@sideline/db";
import {
  computeFreshness,
  SYNC_CADENCE_MS,
  type PlayerDetailResponse,
  type PlayerListItem,
  type PlayersListRequest,
  type PlayersListResponse,
  type PlayerTrendSignal,
} from "@sideline/shared";
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

interface LeagueRow {
  leagueId: string;
  season: number;
  rosterPositions: string[];
  totalRosters: number;
}

function readLeague(h: DbHandle, leagueId: string): LeagueRow | null {
  const row = h.sqlite
    .prepare(
      `SELECT league_id AS leagueId, season, roster_positions_json AS rosterPositionsJson,
              total_rosters AS totalRosters
       FROM leagues WHERE league_id = ?`,
    )
    .get(leagueId) as
    | { leagueId: string; season: number; rosterPositionsJson: string; totalRosters: number }
    | undefined;
  if (row === undefined) return null;
  return {
    leagueId: row.leagueId,
    season: row.season,
    rosterPositions: parseList(row.rosterPositionsJson),
    totalRosters: row.totalRosters,
  };
}

/**
 * `N` for TREND-3: the number of startable players at `position` league-wide, from the league's
 * roster settings: the count of fillable slots (`resolveSlots`) eligible for `position`, times the
 * number of rosters. 0 for an unknown position (no league-wide ranking is meaningful), which
 * `computeConsistency` already treats as "not enough league data" (its own documented edge case).
 */
function startableCountFor(league: LeagueRow, position: string | null): number {
  if (position === null) return 0;
  const { slots } = resolveSlots(league.rosterPositions);
  const slotCount = slots.filter((s) => s.eligiblePositions.includes(position)).length;
  return slotCount * league.totalRosters;
}

const freshnessFor = (h: DbHandle, now: Date) =>
  computeFreshness(lastSuccessAt(h, "stats"), SYNC_CADENCE_MS.stats, now.getTime());

function scoringWeeksFor(
  rows: readonly { week: number; playerId: string; actualPts: number | null }[],
  playerId: string,
): ScoringWeek[] {
  return rows
    .filter((r) => r.playerId === playerId && r.actualPts !== null)
    .map((r) => ({ week: r.week, actualPts: r.actualPts as number }));
}

/**
 * T4.5's players list (LINEUP/TREND prerequisite: pagination). See the module doc for exactly
 * which trend computations are included here versus the detail view.
 */
export function getPlayersList(
  h: DbHandle,
  leagueId: string,
  request: PlayersListRequest,
  now: Date,
): Lookup<PlayersListResponse> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };

  let all = readPlayersDb(h);
  if (request.position !== undefined) {
    const wanted = request.position.toUpperCase();
    all = all.filter((p) => p.position !== null && p.position.toUpperCase() === wanted);
  }
  if (request.q !== undefined) {
    const needle = request.q.toLowerCase();
    all = all.filter((p) => p.fullName.toLowerCase().includes(needle));
  }
  all = [...all].sort(
    (a, b) => a.fullName.localeCompare(b.fullName) || a.playerId.localeCompare(b.playerId),
  );

  const total = all.length;
  const start = (request.page - 1) * request.pageSize;
  const pageRows = all.slice(start, start + request.pageSize);
  const pageIds = new Set(pageRows.map((p) => p.playerId));

  const pointsRows = readLeaguePlayerWeekPoints(h, leagueId, league.season).filter((r) =>
    pageIds.has(r.playerId),
  );

  const players: PlayerListItem[] = pageRows.map((p) => {
    const trend = computeScoringTrend({ weeklyPoints: scoringWeeksFor(pointsRows, p.playerId) });
    let signal: PlayerTrendSignal | null = null;
    if (trend.l3Delta !== null) {
      signal = computeTrendSignal({
        l3Delta: trend.l3Delta,
        usageDelta: null,
        seasonPpg: trend.seasonPpg ?? 0,
      }).signal;
    }
    return {
      playerId: p.playerId,
      name: p.fullName,
      position: p.position,
      nflTeam: p.team,
      status: p.status,
      injuryStatus: p.injuryStatus,
      seasonPpg: trend.seasonPpg,
      l3Ppg: trend.l3Ppg,
      l3Delta: trend.l3Delta,
      gamesPlayed: trend.gamesPlayed,
      signal,
    };
  });

  return {
    ok: true,
    data: {
      players,
      page: request.page,
      pageSize: request.pageSize,
      total,
      hasMore: request.page * request.pageSize < total,
      freshness: freshnessFor(h, now),
    },
  };
}

function consistencyWeeksFor(
  h: DbHandle,
  leagueId: string,
  league: LeagueRow,
  weeklyPoints: readonly ScoringWeek[],
  playerId: string,
  position: string | null,
): ConsistencyWeek[] {
  if (position === null) {
    // No position to rank against league-wide; `startableCount` of 0 below makes
    // `computeConsistency` ignore `positionRank` entirely, so the filler value is never read.
    return weeklyPoints.map((w) => ({ week: w.week, actualPts: w.actualPts, positionRank: 0 }));
  }
  // One indexed query for all of this player's weeks (not a league-wide rescan per week).
  const rankByWeek = new Map(
    readPlayerWeekPositionRanks(h, leagueId, league.season, playerId).map(
      (r) => [r.week, r.rank] as const,
    ),
  );
  return weeklyPoints.map((w) => ({
    week: w.week,
    actualPts: w.actualPts,
    positionRank: rankByWeek.get(w.week) ?? 0,
  }));
}

/**
 * T4.5's player detail: full profile plus every TREND-1..5 computation. `not_found` covers both an
 * unknown league and an unknown player id (404 either way; see players.test.ts).
 */
export function getPlayerDetail(
  h: DbHandle,
  leagueId: string,
  playerId: string,
  now: Date,
): Lookup<PlayerDetailResponse> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };

  const player: FullPlayerRow | undefined = readPlayersDb(h, [playerId])[0];
  if (player === undefined) return { ok: false, reason: "not_found" };

  const pointsRows = readPlayerWeekPoints(h, leagueId, league.season, playerId);
  const weeklyPoints = scoringWeeksFor(pointsRows, playerId);
  const scoring = computeScoringTrend({ weeklyPoints });

  const weeks = weeklyPoints.map((w) => w.week);
  const usageRows = readPlayerUsageWeeks(h, league.season, weeks, playerId);
  const usage = computeUsageTrend({ position: player.position ?? "", weeks: usageRows });

  const startableCount = startableCountFor(league, player.position);
  const consistencyWeeks = consistencyWeeksFor(
    h,
    leagueId,
    league,
    weeklyPoints,
    playerId,
    player.position,
  );
  const consistency = computeConsistency({ weeks: consistencyWeeks, startableCount });

  let signal: PlayerTrendSignal | null = null;
  let signalReasons: ReturnType<typeof computeTrendSignal>["reasons"] = [];
  if (scoring.l3Delta !== null) {
    const snapPct = usage.fields.find((f) => f.field === "snapPct");
    const result = computeTrendSignal({
      l3Delta: scoring.l3Delta,
      usageDelta: snapPct?.delta ?? null,
      seasonPpg: scoring.seasonPpg ?? 0,
    });
    signal = result.signal;
    signalReasons = result.reasons;
  }

  const trendingEntries = readTrending(h).filter((r) => r.playerId === playerId);
  const momentum = computeTrendingMomentum({ entries: trendingEntries });

  return {
    ok: true,
    data: {
      playerId: player.playerId,
      name: player.fullName,
      position: player.position,
      fantasyPositions: player.fantasyPositions,
      nflTeam: player.team,
      status: player.status,
      injuryStatus: player.injuryStatus,
      scoring: {
        seasonPpg: scoring.seasonPpg,
        l3Ppg: scoring.l3Ppg,
        l3Delta: scoring.l3Delta,
        gamesPlayed: scoring.gamesPlayed,
        weeklySeries: scoring.weeklySeries,
        reasons: scoring.reasons,
      },
      usage: { fields: usage.fields, reasons: usage.reasons },
      consistency: {
        cv: consistency.cv,
        weeks: consistency.weeks,
        boomCount: consistency.boomCount,
        bustCount: consistency.bustCount,
        startableCount,
        reasons: consistency.reasons,
      },
      signal,
      signalReasons,
      momentum: {
        addCount: momentum.addCount,
        dropCount: momentum.dropCount,
        netCount: momentum.netCount,
        label: momentum.label,
        reasons: momentum.reasons,
      },
      freshness: freshnessFor(h, now),
    },
  };
}
