/**
 * Idempotent, change-counting upserts for every synced table (PLAN 4.3, ADR-005 item 5).
 *
 * Each statement is `INSERT ... ON CONFLICT (key) DO UPDATE SET ... WHERE <any column differs>`
 * using `IS NOT` (null-safe), so a re-upsert of identical data changes nothing and counts 0.
 * Volatile bookkeeping columns (`synced_at`, `updated_at`, `fetched_at`) are written on insert and
 * on a real change, but are excluded from the change test. JSON columns are serialized with sorted
 * object keys so identical data compares equal. Transactions are short (chunks of {@link CHUNK}).
 */
import type {
  League,
  LeagueUser,
  Matchup,
  NflState,
  Player,
  PlayerWeekProjection,
  PlayerWeekStats,
  Roster,
  ScheduleGame,
  Transaction,
  TrendingEntry,
  UsageWeek,
} from "@sideline/shared";
import type { DbHandle } from "./connection.js";

export interface UpsertResult {
  rowsChanged: number;
}

const CHUNK = 500;

type Param = string | number | null;

/** JSON.stringify with object keys sorted recursively (arrays keep order). */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

const bool = (b: boolean | null): number | null => (b === null ? null : b ? 1 : 0);

interface TableSpec {
  table: string;
  /** All columns, in the order the row function returns values. */
  columns: readonly string[];
  /** Conflict target columns. */
  keys: readonly string[];
  /** Columns written but not part of the change test. */
  volatile?: readonly string[];
  /** Columns where a null incoming value keeps the stored value (never cleared by an upsert). */
  keepIfNull?: readonly string[];
  /** Columns that keep the stored value when this SQL condition (over `excluded.` and the table) holds. */
  keepWhen?: { columns: readonly string[]; condition: string };
}

function buildSql(spec: TableSpec, extraWhere?: string): string {
  const volatile = new Set(spec.volatile ?? []);
  const keys = new Set(spec.keys);
  const setCols = spec.columns.filter((c) => !keys.has(c));
  const diffCols = setCols.filter((c) => !volatile.has(c));
  const keep = new Set(spec.keepIfNull ?? []);
  const keepWhen = new Set(spec.keepWhen?.columns ?? []);
  const incoming = (c: string): string =>
    keep.has(c)
      ? `COALESCE(excluded.${c}, ${spec.table}.${c})`
      : keepWhen.has(c)
        ? `CASE WHEN ${spec.keepWhen?.condition ?? "0"} THEN ${spec.table}.${c} ELSE excluded.${c} END`
        : `excluded.${c}`;
  const set = setCols.map((c) => `${c} = ${incoming(c)}`).join(", ");
  const diff = diffCols.map((c) => `${spec.table}.${c} IS NOT ${incoming(c)}`).join(" OR ");
  const where = extraWhere === undefined ? `(${diff})` : `(${diff}) AND (${extraWhere})`;
  return (
    `INSERT INTO ${spec.table} (${spec.columns.join(", ")}) VALUES (${spec.columns
      .map(() => "?")
      .join(", ")}) ` + `ON CONFLICT (${spec.keys.join(", ")}) DO UPDATE SET ${set} WHERE ${where}`
  );
}

function runUpsert<T>(
  h: DbHandle,
  spec: TableSpec,
  rows: readonly T[],
  toParams: (row: T) => Param[],
  extraWhere?: string,
): UpsertResult {
  if (rows.length === 0) return { rowsChanged: 0 };
  const stmt = h.sqlite.prepare(buildSql(spec, extraWhere));
  let rowsChanged = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const tx = h.sqlite.transaction(() => {
      let n = 0;
      for (const row of chunk) n += stmt.run(...toParams(row)).changes;
      return n;
    });
    rowsChanged += tx.immediate();
  }
  return { rowsChanged };
}

const LEAGUES: TableSpec = {
  table: "leagues",
  columns: [
    "league_id",
    "season",
    "name",
    "status",
    "settings_json",
    "scoring_json",
    "roster_positions_json",
    "previous_league_id",
    "total_rosters",
    "playoff_week_start",
    "playoff_teams",
    "trade_deadline",
    "waiver_type",
    "waiver_mode",
    "waiver_day_of_week",
    "waiver_clear_days",
    "daily_waivers",
    "waiver_budget",
    "divisions",
    "reserve_slots",
    "taxi_slots",
    "league_average_match",
    "synced_at",
  ],
  keys: ["league_id"],
  volatile: ["synced_at"],
};

export function upsertLeague(h: DbHandle, league: League, syncedAt: string): UpsertResult {
  return runUpsert(h, LEAGUES, [league], (l) => [
    l.leagueId,
    l.season,
    l.name,
    l.status,
    stableJson(l.settings),
    stableJson(l.scoringSettings),
    stableJson(l.rosterPositions),
    l.previousLeagueId,
    l.totalRosters,
    l.playoffWeekStart,
    l.playoffTeams,
    l.tradeDeadline,
    l.waiverType,
    l.waiverMode,
    l.waiverDayOfWeek,
    l.waiverClearDays,
    bool(l.dailyWaivers),
    l.waiverBudget,
    l.divisions,
    l.reserveSlots,
    l.taxiSlots,
    bool(l.leagueAverageMatch),
    syncedAt,
  ]);
}

const LEAGUE_USERS: TableSpec = {
  table: "league_users",
  columns: ["league_id", "user_id", "display_name", "team_name", "avatar"],
  keys: ["league_id", "user_id"],
};

export function upsertLeagueUsers(h: DbHandle, rows: readonly LeagueUser[]): UpsertResult {
  return runUpsert(h, LEAGUE_USERS, rows, (u) => [
    u.leagueId,
    u.userId,
    u.displayName,
    u.teamName,
    u.avatar,
  ]);
}

const ROSTERS: TableSpec = {
  table: "rosters",
  columns: [
    "league_id",
    "roster_id",
    "owner_id",
    "players_json",
    "starters_json",
    "reserve_json",
    "taxi_json",
    "wins",
    "losses",
    "ties",
    "fpts",
    "fpts_against",
    "waiver_position",
    "waiver_budget_used",
    "synced_at",
  ],
  keys: ["league_id", "roster_id"],
  volatile: ["synced_at"],
};

/** Starters may contain "0" (empty slot); stored as-is. */
export function upsertRosters(
  h: DbHandle,
  rows: readonly Roster[],
  syncedAt: string,
): UpsertResult {
  return runUpsert(h, ROSTERS, rows, (r) => [
    r.leagueId,
    r.rosterId,
    r.ownerId,
    stableJson(r.players),
    stableJson(r.starters),
    stableJson(r.reserve),
    stableJson(r.taxi),
    r.wins,
    r.losses,
    r.ties,
    r.fpts,
    r.fptsAgainst,
    r.waiverPosition,
    r.waiverBudgetUsed,
    syncedAt,
  ]);
}

const PLAYERS: TableSpec = {
  table: "players",
  columns: [
    "player_id",
    "full_name",
    "first_name",
    "last_name",
    "position",
    "fantasy_positions_json",
    "team",
    "status",
    "injury_status",
    "injury_body_part",
    "active",
    "age",
    "years_exp",
    "depth_chart_order",
    "search_rank",
    "gsis_id",
    "espn_id",
    "updated_at",
  ],
  keys: ["player_id"],
  volatile: ["updated_at"],
  keepIfNull: ["espn_id"],
};

/** Chunked into transactions of 500 rows. */
export function upsertPlayers(
  h: DbHandle,
  rows: readonly Player[],
  updatedAt: string,
): UpsertResult {
  return runUpsert(h, PLAYERS, rows, (p) => [
    p.playerId,
    p.fullName,
    p.firstName,
    p.lastName,
    p.position,
    stableJson(p.fantasyPositions),
    p.team,
    p.status,
    p.injuryStatus,
    p.injuryBodyPart,
    bool(p.active),
    p.age,
    p.yearsExp,
    p.depthChartOrder,
    p.searchRank,
    p.gsisId,
    p.espnId ?? null,
    updatedAt,
  ]);
}

const MATCHUPS: TableSpec = {
  table: "matchups",
  columns: [
    "league_id",
    "week",
    "roster_id",
    "matchup_id",
    "starters_json",
    "starters_points_json",
    "players_json",
    "players_points_json",
    "points",
  ],
  keys: ["league_id", "week", "roster_id"],
};

/** Starters may contain "0" (empty slot); stored as-is. */
export function upsertMatchups(h: DbHandle, rows: readonly Matchup[]): UpsertResult {
  return runUpsert(h, MATCHUPS, rows, (m) => [
    m.leagueId,
    m.week,
    m.rosterId,
    m.matchupId,
    stableJson(m.starters),
    stableJson(m.startersPoints),
    stableJson(m.players),
    stableJson(m.playersPoints),
    m.points,
  ]);
}

const TRANSACTIONS: TableSpec = {
  table: "transactions",
  columns: [
    "league_id",
    "transaction_id",
    "week",
    "type",
    "status",
    "adds_json",
    "drops_json",
    "waiver_bid",
    "roster_ids_json",
    "creator",
    "created_at",
    "status_updated_at",
    "draft_picks_json",
    "waiver_budget_json",
    "consenter_ids_json",
  ],
  keys: ["league_id", "transaction_id"],
};

const jsonOrNull = (v: unknown): string | null => (v === null ? null : stableJson(v));

export function upsertTransactions(h: DbHandle, rows: readonly Transaction[]): UpsertResult {
  return runUpsert(h, TRANSACTIONS, rows, (t) => [
    t.leagueId,
    t.transactionId,
    t.week,
    t.type,
    t.status,
    jsonOrNull(t.adds),
    jsonOrNull(t.drops),
    t.waiverBid,
    stableJson(t.rosterIds),
    t.creator,
    t.createdAt,
    t.statusUpdatedAt,
    stableJson(t.draftPicks),
    stableJson(t.waiverBudget),
    jsonOrNull(t.consenterIds),
  ]);
}

const STATS: TableSpec = {
  table: "player_week_stats",
  columns: ["season", "season_type", "week", "player_id", "source", "stats_json"],
  keys: ["season", "season_type", "week", "player_id", "source"],
};

export function upsertPlayerWeekStats(h: DbHandle, rows: readonly PlayerWeekStats[]): UpsertResult {
  return runUpsert(h, STATS, rows, (s) => [
    s.season,
    s.seasonType,
    s.week,
    s.playerId,
    s.source,
    stableJson(s.stats),
  ]);
}

const PROJECTIONS: TableSpec = {
  table: "player_week_projections",
  columns: [
    "season",
    "season_type",
    "week",
    "player_id",
    "stats_json",
    "opponent",
    "source",
    "fetched_at",
  ],
  keys: ["season", "season_type", "week", "player_id"],
  volatile: ["fetched_at"],
};

const projParams = (p: PlayerWeekProjection): Param[] => [
  p.season,
  p.seasonType,
  p.week,
  p.playerId,
  stableJson(p.stats),
  p.opponent,
  p.source,
  p.fetchedAt,
];

/** Latest projection per player-week. `fetched_at` only advances when the content changes. */
export function upsertPlayerWeekProjections(
  h: DbHandle,
  rows: readonly PlayerWeekProjection[],
): UpsertResult {
  return runUpsert(h, PROJECTIONS, rows, projParams);
}

const SNAPSHOTS: TableSpec = { ...PROJECTIONS, table: "player_week_projection_snapshots" };

/**
 * Pre-kickoff snapshots (ADR-002 item 1). A row is written only when `fetchedAt < kickoff`
 * (strict), replacing an older snapshot whose content differs; a later fetch never overwrites an
 * existing snapshot with an older fetch. Rows with unknown kickoff (null) are skipped and counted.
 */
export function upsertProjectionSnapshots(
  h: DbHandle,
  rows: readonly PlayerWeekProjection[],
  kickoffByPlayerWeek: (playerId: string, week: number) => string | null,
): UpsertResult & { skipped: number } {
  let skipped = 0;
  const eligible = rows.filter((r) => {
    const kickoff = kickoffByPlayerWeek(r.playerId, r.week);
    if (kickoff === null) {
      skipped += 1;
      return false;
    }
    const k = Date.parse(kickoff);
    const f = Date.parse(r.fetchedAt);
    return !Number.isNaN(k) && !Number.isNaN(f) && f < k;
  });
  const res = runUpsert(
    h,
    SNAPSHOTS,
    eligible,
    projParams,
    "excluded.fetched_at > player_week_projection_snapshots.fetched_at",
  );
  return { ...res, skipped };
}

const SCHEDULE: TableSpec = {
  table: "schedule",
  columns: [
    "season",
    "week",
    "game_id",
    "game_type",
    "home",
    "away",
    "kickoff_utc",
    "kickoff_approximate",
    "roof",
    "spread_line",
    "total_line",
    "home_score",
    "away_score",
    "stadium_id",
  ],
  keys: ["season", "game_id"],
};

/** A schedule row plus the optional nflverse stadium id (missing writes null). */
export type ScheduleUpsertRow = ScheduleGame & { stadiumId?: string | null };

export function upsertSchedule(h: DbHandle, rows: readonly ScheduleUpsertRow[]): UpsertResult {
  return runUpsert(h, SCHEDULE, rows, (g) => [
    g.season,
    g.week,
    g.gameId,
    g.gameType,
    g.home,
    g.away,
    g.kickoffUtc,
    bool(g.kickoffApproximate),
    g.roof,
    g.spreadLine,
    g.totalLine,
    g.homeScore,
    g.awayScore,
    g.stadiumId ?? null,
  ]);
}

const GAME_WEATHER: TableSpec = {
  table: "game_weather",
  columns: [
    "season",
    "game_id",
    "week",
    "kickoff_utc",
    "status",
    "temperature_f",
    "wind_mph",
    "gust_mph",
    "precip_probability",
    "precip_type",
    "fetched_at",
    "updated_at",
  ],
  keys: ["season", "game_id"],
  // A refetch with identical values is not a change (ADR-005).
  volatile: ["fetched_at", "updated_at"],
};

export interface GameWeatherUpsertRow {
  season: number;
  week: number;
  gameId: string;
  kickoffUtc: string;
  status: "forecast" | "indoors" | "unavailable";
  temperatureF: number | null;
  windMph: number | null;
  gustMph: number | null;
  precipProbability: number | null;
  precipType: "none" | "rain" | "snow" | "mixed" | null;
  fetchedAt: string | null;
  updatedAt: string;
}

export function upsertGameWeather(
  h: DbHandle,
  rows: readonly GameWeatherUpsertRow[],
): UpsertResult {
  return runUpsert(h, GAME_WEATHER, rows, (w) => [
    w.season,
    w.gameId,
    w.week,
    w.kickoffUtc,
    w.status,
    w.temperatureF,
    w.windMph,
    w.gustMph,
    w.precipProbability,
    w.precipType,
    w.fetchedAt,
    w.updatedAt,
  ]);
}

const USAGE: TableSpec = {
  table: "usage_week",
  columns: [
    "season",
    "week",
    "player_id",
    "team",
    "snap_pct",
    "targets",
    "target_share",
    "air_yards_share",
    "carries",
    "carry_share",
    "rz_touches",
  ],
  keys: ["season", "week", "player_id"],
};

export function upsertUsageWeek(h: DbHandle, rows: readonly UsageWeek[]): UpsertResult {
  return runUpsert(h, USAGE, rows, (u) => [
    u.season,
    u.week,
    u.playerId,
    u.team,
    u.snapPct,
    u.targets,
    u.targetShare,
    u.airYardsShare,
    u.carries,
    u.carryShare,
    u.rzTouches,
  ]);
}

const NFL_STATE: TableSpec = {
  table: "nfl_state",
  columns: [
    "id",
    "season",
    "week",
    "season_type",
    "display_week",
    "leg",
    "previous_season",
    "season_start_date",
    "fetched_at",
  ],
  keys: ["id"],
  volatile: ["fetched_at"],
};

/** Single row (id = 1). */
export function upsertNflState(h: DbHandle, state: NflState, fetchedAt: string): UpsertResult {
  return runUpsert(h, NFL_STATE, [state], (s) => [
    1,
    s.season,
    s.week,
    s.seasonType,
    s.displayWeek,
    s.leg,
    s.previousSeason,
    s.seasonStartDate,
    fetchedAt,
  ]);
}

/** Derived: league-scored points per player-week (PLAN 4.3/4.5, SCORE-1/SCORE-3). */
export interface UpsertLeaguePlayerWeekPointsRow {
  leagueId: string;
  season: number;
  week: number;
  playerId: string;
  actualPts: number | null;
  projPts: number | null;
}

const LEAGUE_PLAYER_WEEK_POINTS: TableSpec = {
  table: "league_player_week_points",
  columns: ["league_id", "season", "week", "player_id", "actual_pts", "proj_pts"],
  keys: ["league_id", "season", "week", "player_id"],
};

export function upsertLeaguePlayerWeekPoints(
  h: DbHandle,
  rows: readonly UpsertLeaguePlayerWeekPointsRow[],
): UpsertResult {
  return runUpsert(h, LEAGUE_PLAYER_WEEK_POINTS, rows, (r) => [
    r.leagueId,
    r.season,
    r.week,
    r.playerId,
    r.actualPts,
    r.projPts,
  ]);
}

/** Derived: per-league points allowed by team and position, trailing through a week (MATCH-1). */
export interface UpsertDefenseVsPositionRow {
  leagueId: string;
  season: number;
  throughWeek: number;
  team: string;
  position: string;
  ptsAllowedPg: number;
  games: number;
}

const DEFENSE_VS_POSITION: TableSpec = {
  table: "defense_vs_position",
  columns: ["league_id", "season", "through_week", "team", "position", "pts_allowed_pg", "games"],
  keys: ["league_id", "season", "through_week", "team", "position"],
};

export function upsertDefenseVsPosition(
  h: DbHandle,
  rows: readonly UpsertDefenseVsPositionRow[],
): UpsertResult {
  return runUpsert(h, DEFENSE_VS_POSITION, rows, (r) => [
    r.leagueId,
    r.season,
    r.throughWeek,
    r.team,
    r.position,
    r.ptsAllowedPg,
    r.games,
  ]);
}

/**
 * Replaces the whole set of trending rows of one type atomically. Counts rows deleted (absent from
 * the new set) plus rows inserted or whose count changed; an identical set counts 0.
 */
export function replaceTrending(
  h: DbHandle,
  type: "add" | "drop",
  entries: readonly TrendingEntry[],
  fetchedAt: string,
): UpsertResult {
  const keyOf = (playerId: string, lookback: number): string => `${playerId}|${lookback}`;
  const tx = h.sqlite.transaction(() => {
    const wanted = new Set(entries.map((e) => keyOf(e.playerId, e.lookbackHours)));
    const existing = h.sqlite
      .prepare("SELECT player_id AS p, lookback_hours AS l FROM trending WHERE type = ?")
      .all(type) as { p: string; l: number }[];
    const del = h.sqlite.prepare(
      "DELETE FROM trending WHERE type = ? AND player_id = ? AND lookback_hours = ?",
    );
    let n = 0;
    for (const row of existing) {
      if (!wanted.has(keyOf(row.p, row.l))) n += del.run(type, row.p, row.l).changes;
    }
    const up = h.sqlite.prepare(
      buildSql({
        table: "trending",
        columns: ["player_id", "type", "count", "lookback_hours", "fetched_at"],
        keys: ["player_id", "type", "lookback_hours"],
        volatile: ["fetched_at"],
      }),
    );
    for (const e of entries)
      n += up.run(e.playerId, type, e.count, e.lookbackHours, fetchedAt).changes;
    return n;
  });
  return { rowsChanged: tx.immediate() };
}

const PLAYER_NEWS: TableSpec = {
  table: "player_news",
  columns: [
    "id",
    "player_id",
    "headline",
    "summary",
    "url",
    "source",
    "kind",
    "published_at",
    "fetched_at",
  ],
  keys: ["id"],
  volatile: ["fetched_at"],
  // A stored note is never downgraded by a later article with the same id: keep its kind and full analysis.
  keepWhen: {
    columns: ["kind", "summary"],
    condition: "excluded.kind = 'article' AND player_news.kind = 'note'",
  },
};

/** One ESPN (or other provider) news item for one player. `id` is namespaced, e.g. `espn:<story>:<player>`. */
export interface PlayerNewsRow {
  id: string;
  playerId: string;
  headline: string;
  summary: string | null;
  url: string | null;
  source: string;
  /** Defaults to "article" when omitted. */
  kind?: "note" | "article";
  /** ISO 8601. */
  publishedAt: string;
  /** ISO 8601. Written on insert and on a real change, not part of the change test. */
  fetchedAt: string;
}

/** Idempotent: re-upserting identical items counts 0 (only `fetched_at` differs). */
export function upsertPlayerNews(h: DbHandle, rows: readonly PlayerNewsRow[]): UpsertResult {
  return runUpsert(h, PLAYER_NEWS, rows, (n) => [
    n.id,
    n.playerId,
    n.headline,
    n.summary,
    n.url,
    n.source,
    n.kind ?? "article",
    n.publishedAt,
    n.fetchedAt,
  ]);
}

/** Deletes news published before `olderThanIso`; returns the number of rows deleted. */
export function prunePlayerNews(h: DbHandle, opts: { olderThanIso: string }): number {
  return h.sqlite.prepare("DELETE FROM player_news WHERE published_at < ?").run(opts.olderThanIso)
    .changes;
}

/**
 * Fills `players.espn_id` from an external crosswalk (player_id -> espn_id). Only touches rows whose
 * stored value IS NULL (never overwrites a Sleeper-provided id); unknown players and blank ids are
 * ignored. Chunked transactions; returns the number of rows changed.
 */
export function fillMissingEspnIds(h: DbHandle, ids: ReadonlyMap<string, string>): number {
  const pairs: [string, string][] = [];
  for (const [playerId, espnId] of ids) {
    const e = espnId.trim();
    if (e !== "") pairs.push([playerId, e]);
  }
  if (pairs.length === 0) return 0;
  const stmt = h.sqlite.prepare(
    "UPDATE players SET espn_id = ? WHERE player_id = ? AND espn_id IS NULL",
  );
  let changed = 0;
  const CHUNK = 1000;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const slice = pairs.slice(i, i + CHUNK);
    h.sqlite.transaction(() => {
      for (const [playerId, e] of slice) changed += stmt.run(e, playerId).changes;
    })();
  }
  return changed;
}
