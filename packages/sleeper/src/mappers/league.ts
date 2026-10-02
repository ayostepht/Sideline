import {
  deriveWaiverMode,
  type League,
  type LeagueUser,
  type Matchup,
  type NflState,
  type Roster,
  type Transaction,
} from "@sideline/shared";
import type {
  RawLeague,
  RawLeagueUser,
  RawMatchup,
  RawRoster,
  RawState,
  RawTransaction,
} from "../schemas/raw.js";

/** Keeps finite numeric entries of an untyped settings map. */
function numericEntries(map: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Combines Sleeper's integer and two-digit `_decimal` parts: (366, 28) -> 366.28. */
export function combineDecimal(whole: number | undefined, decimal: number | undefined): number {
  return Math.round((whole ?? 0) * 100 + (decimal ?? 0)) / 100;
}

export function mapState(raw: RawState): NflState {
  return {
    season: Number(raw.season),
    week: raw.week,
    seasonType: raw.season_type,
    displayWeek: raw.display_week ?? raw.week,
    leg: raw.leg ?? raw.week,
    previousSeason: raw.previous_season == null ? null : Number(raw.previous_season),
    seasonStartDate: raw.season_start_date ?? null,
  };
}

export function mapLeague(raw: RawLeague): League {
  const settings = numericEntries(raw.settings);
  const waiverType = settings["waiver_type"] ?? null;
  // Sleeper uses "0" (and sometimes "") for "no previous league".
  const prev = raw.previous_league_id;
  return {
    leagueId: raw.league_id,
    season: Number(raw.season),
    name: raw.name,
    status: raw.status,
    previousLeagueId: prev == null || prev === "" || prev === "0" ? null : prev,
    totalRosters: raw.total_rosters,
    rosterPositions: raw.roster_positions ?? [],
    scoringSettings: { ...raw.scoring_settings },
    playoffWeekStart: settings["playoff_week_start"] ?? null,
    playoffTeams: settings["playoff_teams"] ?? null,
    tradeDeadline: settings["trade_deadline"] ?? null,
    waiverType,
    waiverMode: deriveWaiverMode(waiverType),
    waiverDayOfWeek: settings["waiver_day_of_week"] ?? null,
    waiverClearDays: settings["waiver_clear_days"] ?? null,
    dailyWaivers: (settings["daily_waivers"] ?? 0) !== 0,
    waiverBudget: settings["waiver_budget"] ?? null,
    divisions: settings["divisions"] ?? null,
    reserveSlots: settings["reserve_slots"] ?? 0,
    taxiSlots: settings["taxi_slots"] ?? 0,
    leagueAverageMatch: (settings["league_average_match"] ?? 0) !== 0,
    settings,
  };
}

export function mapLeagueUser(raw: RawLeagueUser, leagueId: string): LeagueUser {
  const team = raw.metadata?.team_name?.trim();
  return {
    leagueId,
    userId: raw.user_id,
    displayName: raw.display_name,
    teamName: team ? team : null,
    avatar: raw.avatar ?? null,
  };
}

export function mapRoster(raw: RawRoster, leagueId: string): Roster {
  const s = raw.settings;
  return {
    leagueId,
    rosterId: raw.roster_id,
    ownerId: raw.owner_id ?? null,
    players: raw.players ?? [],
    starters: raw.starters ?? [],
    reserve: raw.reserve ?? [],
    taxi: raw.taxi ?? [],
    wins: s?.wins ?? 0,
    losses: s?.losses ?? 0,
    ties: s?.ties ?? 0,
    fpts: combineDecimal(s?.fpts, s?.fpts_decimal),
    fptsAgainst: combineDecimal(s?.fpts_against, s?.fpts_against_decimal),
    waiverPosition: s?.waiver_position ?? null,
    waiverBudgetUsed: s?.waiver_budget_used ?? 0,
  };
}

export function mapMatchup(raw: RawMatchup, leagueId: string, week: number): Matchup {
  const playersPoints: Record<string, number> = {};
  for (const [id, pts] of Object.entries(raw.players_points ?? {})) playersPoints[id] = pts ?? 0;
  return {
    leagueId,
    week,
    rosterId: raw.roster_id,
    matchupId: raw.matchup_id ?? null,
    starters: raw.starters ?? [],
    startersPoints: (raw.starters_points ?? []).map((p) => p ?? 0),
    players: raw.players ?? [],
    playersPoints,
    points: raw.points ?? 0,
  };
}

export function mapTransaction(raw: RawTransaction, leagueId: string): Transaction {
  return {
    leagueId,
    transactionId: raw.transaction_id,
    week: raw.leg,
    type: raw.type,
    status: raw.status,
    adds: raw.adds ?? null,
    drops: raw.drops ?? null,
    rosterIds: raw.roster_ids ?? [],
    waiverBid: raw.settings?.waiver_bid ?? null,
    creator: raw.creator ?? null,
    createdAt: raw.created,
    statusUpdatedAt: raw.status_updated ?? null,
    draftPicks: raw.draft_picks ?? [],
    waiverBudget: raw.waiver_budget ?? [],
    consenterIds: raw.consenter_ids ?? null,
  };
}
