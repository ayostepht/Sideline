/**
 * Drizzle schema (PLAN 4.5 as amended by ADR-002, ADR-005, ADR-006).
 *
 * Conventions:
 * - snake_case columns; camelCase TS properties.
 * - `*_json` columns are TEXT holding JSON. The shape is documented per column and validated with
 *   zod by the data layer on read (never trusted).
 * - Timestamps: ISO 8601 TEXT (`*_at`, `fetched_at`, `kickoff_utc`) matching the shared DTOs, except
 *   `transactions.created_at` / `status_updated_at` which are ms epoch INTEGER (shared Transaction).
 * - `season_type` is one of "pre" | "regular" | "post" | "off" (shared SeasonType).
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Key/value settings. Keys in use: `worker_heartbeat`, `sync_lease`, `players_fetched_at`. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const leagues = sqliteTable("leagues", {
  leagueId: text("league_id").primaryKey(),
  season: integer("season").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  /** JSON object: raw Sleeper league `settings`. */
  settingsJson: text("settings_json").notNull(),
  /** JSON object: stat key to points (`scoring_settings`). */
  scoringJson: text("scoring_json").notNull(),
  /** JSON string[]: `roster_positions`. */
  rosterPositionsJson: text("roster_positions_json").notNull(),
  previousLeagueId: text("previous_league_id"),
  totalRosters: integer("total_rosters").notNull(),
  playoffWeekStart: integer("playoff_week_start"),
  playoffTeams: integer("playoff_teams"),
  tradeDeadline: integer("trade_deadline"),
  waiverType: integer("waiver_type"),
  /** "rolling" | "faab" | "reverse_standings" | "unknown" (shared WaiverMode). */
  waiverMode: text("waiver_mode").notNull().default("unknown"),
  waiverDayOfWeek: integer("waiver_day_of_week"),
  waiverClearDays: integer("waiver_clear_days"),
  dailyWaivers: integer("daily_waivers", { mode: "boolean" }).notNull().default(false),
  waiverBudget: real("waiver_budget"),
  divisions: integer("divisions"),
  reserveSlots: integer("reserve_slots").notNull().default(0),
  taxiSlots: integer("taxi_slots").notNull().default(0),
  leagueAverageMatch: integer("league_average_match", { mode: "boolean" }).notNull().default(false),
  /** ISO 8601. */
  syncedAt: text("synced_at").notNull(),
});

export const leagueUsers = sqliteTable(
  "league_users",
  {
    leagueId: text("league_id").notNull(),
    userId: text("user_id").notNull(),
    /** Untrusted text. */
    displayName: text("display_name").notNull(),
    /** Untrusted text. */
    teamName: text("team_name"),
    avatar: text("avatar"),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

export const rosters = sqliteTable(
  "rosters",
  {
    leagueId: text("league_id").notNull(),
    rosterId: integer("roster_id").notNull(),
    ownerId: text("owner_id"),
    /** JSON string[] of player ids (also `starters_json`, `reserve_json`, `taxi_json`). */
    playersJson: text("players_json").notNull(),
    startersJson: text("starters_json").notNull(),
    reserveJson: text("reserve_json").notNull(),
    taxiJson: text("taxi_json").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    fpts: real("fpts").notNull().default(0),
    fptsAgainst: real("fpts_against").notNull().default(0),
    /** 1 = first claim priority; null when unset. */
    waiverPosition: integer("waiver_position"),
    waiverBudgetUsed: real("waiver_budget_used").notNull().default(0),
    /** ISO 8601. */
    syncedAt: text("synced_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.rosterId] }),
    index("rosters_owner_idx").on(t.leagueId, t.ownerId),
  ],
);

/** Sleeper player directory (fetched at most once a day). `gsis_id` is trimmed (ADR-006 item 5). */
export const players = sqliteTable(
  "players",
  {
    playerId: text("player_id").primaryKey(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    position: text("position"),
    /** JSON string[]. */
    fantasyPositionsJson: text("fantasy_positions_json").notNull(),
    team: text("team"),
    status: text("status"),
    injuryStatus: text("injury_status"),
    injuryBodyPart: text("injury_body_part"),
    /** 0/1, null when unknown. */
    active: integer("active", { mode: "boolean" }),
    age: real("age"),
    yearsExp: real("years_exp"),
    depthChartOrder: integer("depth_chart_order"),
    searchRank: integer("search_rank"),
    gsisId: text("gsis_id"),
    /** ISO 8601. */
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("players_team_idx").on(t.team),
    index("players_position_idx").on(t.position),
    index("players_gsis_idx").on(t.gsisId),
    index("players_search_rank_idx").on(t.searchRank),
  ],
);

/** Actual stats. `stats_json`: JSON object of stat key to number. */
export const playerWeekStats = sqliteTable(
  "player_week_stats",
  {
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    statsJson: text("stats_json").notNull(),
    /** "sleeper" | "nflverse". */
    source: text("source").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.seasonType, t.week, t.playerId, t.source] }),
    index("pws_season_week_idx").on(t.season, t.week),
    index("pws_player_idx").on(t.playerId, t.season),
  ],
);

/** Latest projection fetch per player-week. `stats_json`: JSON object of stat key to number. */
export const playerWeekProjections = sqliteTable(
  "player_week_projections",
  {
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    statsJson: text("stats_json").notNull(),
    opponent: text("opponent"),
    source: text("source").notNull(),
    /** ISO 8601. */
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.seasonType, t.week, t.playerId] }),
    index("pwp_season_week_idx").on(t.season, t.week),
    index("pwp_player_idx").on(t.playerId, t.season),
  ],
);

/** Last projection fetch before the player's kickoff (ADR-002 item 1); used by backtests. */
export const playerWeekProjectionSnapshots = sqliteTable(
  "player_week_projection_snapshots",
  {
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    statsJson: text("stats_json").notNull(),
    opponent: text("opponent"),
    source: text("source").notNull(),
    /** ISO 8601 time of the fetch this snapshot came from. */
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.seasonType, t.week, t.playerId] }),
    index("pwps_season_week_idx").on(t.season, t.week),
    index("pwps_player_idx").on(t.playerId, t.season),
  ],
);

/** Derived: league-scored points per player-week. */
export const leaguePlayerWeekPoints = sqliteTable(
  "league_player_week_points",
  {
    leagueId: text("league_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    actualPts: real("actual_pts"),
    projPts: real("proj_pts"),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.season, t.week, t.playerId] }),
    index("lpwp_player_idx").on(t.leagueId, t.playerId, t.season),
  ],
);

/** Derived per league scoring (league_id added to PLAN 4.5 because scoring is per league). */
export const defenseVsPosition = sqliteTable(
  "defense_vs_position",
  {
    leagueId: text("league_id").notNull(),
    season: integer("season").notNull(),
    throughWeek: integer("through_week").notNull(),
    team: text("team").notNull(),
    position: text("position").notNull(),
    ptsAllowedPg: real("pts_allowed_pg").notNull(),
    games: integer("games").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.season, t.throughWeek, t.team, t.position] })],
);

export const matchups = sqliteTable(
  "matchups",
  {
    leagueId: text("league_id").notNull(),
    week: integer("week").notNull(),
    rosterId: integer("roster_id").notNull(),
    matchupId: integer("matchup_id"),
    /** JSON string[]. */
    startersJson: text("starters_json").notNull(),
    /** JSON number[] aligned with starters. */
    startersPointsJson: text("starters_points_json").notNull().default("[]"),
    /** JSON string[] of all player ids on the roster that week. */
    playersJson: text("players_json").notNull().default("[]"),
    /** JSON object: player id to points. */
    playersPointsJson: text("players_points_json").notNull(),
    points: real("points").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.week, t.rosterId] }),
    index("matchups_pair_idx").on(t.leagueId, t.week, t.matchupId),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    leagueId: text("league_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    week: integer("week").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    /** JSON object: player id to roster id; null when none. */
    addsJson: text("adds_json"),
    dropsJson: text("drops_json"),
    waiverBid: real("waiver_bid"),
    /** JSON number[]. */
    rosterIdsJson: text("roster_ids_json").notNull(),
    creator: text("creator"),
    /** ms epoch. */
    createdAt: integer("created_at").notNull(),
    /** ms epoch. */
    statusUpdatedAt: integer("status_updated_at"),
    /** JSON array of passthrough objects. */
    draftPicksJson: text("draft_picks_json").notNull().default("[]"),
    /** JSON array of {sender, receiver, amount}. */
    waiverBudgetJson: text("waiver_budget_json").notNull().default("[]"),
    /** JSON number[]; null when absent. */
    consenterIdsJson: text("consenter_ids_json"),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.transactionId] }),
    index("transactions_week_idx").on(t.leagueId, t.week, t.createdAt),
    index("transactions_created_idx").on(t.leagueId, t.createdAt),
  ],
);

export const schedule = sqliteTable(
  "schedule",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gameId: text("game_id").notNull(),
    gameType: text("game_type").notNull(),
    home: text("home").notNull(),
    away: text("away").notNull(),
    /** ISO 8601 UTC; null if unknown. */
    kickoffUtc: text("kickoff_utc"),
    kickoffApproximate: integer("kickoff_approximate", { mode: "boolean" })
      .notNull()
      .default(false),
    roof: text("roof"),
    spreadLine: real("spread_line"),
    totalLine: real("total_line"),
    homeScore: real("home_score"),
    awayScore: real("away_score"),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.gameId] }),
    index("schedule_season_week_idx").on(t.season, t.week),
    index("schedule_home_idx").on(t.season, t.home),
    index("schedule_away_idx").on(t.season, t.away),
  ],
);

/** nflverse usage. Shares are 0 to 1 fractions. `rz_touches` is nullable (ADR-005 item 13). */
export const usageWeek = sqliteTable(
  "usage_week",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(),
    team: text("team"),
    snapPct: real("snap_pct"),
    targets: real("targets"),
    targetShare: real("target_share"),
    airYardsShare: real("air_yards_share"),
    carries: real("carries"),
    carryShare: real("carry_share"),
    rzTouches: real("rz_touches"),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.week, t.playerId] }),
    index("usage_player_idx").on(t.playerId, t.season),
  ],
);

export const trending = sqliteTable(
  "trending",
  {
    playerId: text("player_id").notNull(),
    /** "add" | "drop". */
    type: text("type").notNull(),
    count: integer("count").notNull(),
    lookbackHours: integer("lookback_hours").notNull(),
    /** ISO 8601. */
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.type, t.lookbackHours] })],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    job: text("job").notNull(),
    /** ISO 8601. */
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    /** "running" | "success" | "failed" | "skipped". */
    status: text("status").notNull(),
    callsMade: integer("calls_made").notNull().default(0),
    rowsChanged: integer("rows_changed").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_job_idx").on(t.job, t.id),
    index("sync_runs_job_status_idx").on(t.job, t.status, t.id),
  ],
);

export const computedCache = sqliteTable(
  "computed_cache",
  {
    leagueId: text("league_id").notNull(),
    week: integer("week").notNull(),
    kind: text("kind").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    /** JSON; validated by the data layer on read. */
    payloadJson: text("payload_json").notNull(),
    /** ISO 8601. */
    computedAt: text("computed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.week, t.kind, t.inputsHash] })],
);

/** Single row (id = 1): latest normalized Sleeper `/state/nfl`. */
export const nflState = sqliteTable(
  "nfl_state",
  {
    id: integer("id").primaryKey(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("season_type").notNull(),
    displayWeek: integer("display_week").notNull(),
    leg: integer("leg").notNull(),
    previousSeason: integer("previous_season"),
    /** ISO date (YYYY-MM-DD). */
    seasonStartDate: text("season_start_date"),
    /** ISO 8601. */
    fetchedAt: text("fetched_at").notNull(),
  },
  () => [check("nfl_state_single_row", sql`id = 1`)],
);

/** ETag store (not used for `/players/nfl`). */
export const httpCache = sqliteTable("http_cache", {
  url: text("url").primaryKey(),
  etag: text("etag"),
  body: text("body").notNull(),
  /** ISO 8601. */
  fetchedAt: text("fetched_at").notNull(),
});

/** Manual sync runs queued for the worker (ADR-005 item 3). Matches shared SyncRequest. */
export const syncRequests = sqliteTable(
  "sync_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** A SyncJobName, "all", or an onboarding job ("user", "user_leagues"). */
    job: text("job").notNull(),
    /** JSON object validated with shared parseParamsForJob; null for jobs without params. */
    paramsJson: text("params_json"),
    /** ISO 8601. */
    requestedAt: text("requested_at").notNull(),
    /** "pending" | "running" | "done" | "failed". */
    status: text("status").notNull(),
    /** "api" | "cli". */
    source: text("source").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    error: text("error"),
  },
  (t) => [
    index("sync_requests_status_idx").on(t.status, t.id),
    index("sync_requests_job_idx").on(t.job, t.requestedAt),
  ],
);

/**
 * The Sleeper user's leagues found during onboarding (ADR-009). A table rather than an
 * app_settings JSON key: it is replaced per (user, season) and read back as rows for the picker.
 */
export const userLeagues = sqliteTable(
  "user_leagues",
  {
    userId: text("user_id").notNull(),
    leagueId: text("league_id").notNull(),
    season: integer("season").notNull(),
    /** Untrusted text. */
    name: text("name").notNull(),
    status: text("status").notNull(),
    totalRosters: integer("total_rosters").notNull(),
    avatar: text("avatar"),
    /** ISO 8601. */
    syncedAt: text("synced_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.leagueId, t.season] })],
);
