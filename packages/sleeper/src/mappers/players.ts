import type {
  Player,
  PlayerWeekProjection,
  PlayerWeekStats,
  SeasonType,
  TrendingEntry,
} from "@sideline/shared";
import type { RawPlayer, RawStatRow, RawTrending } from "../schemas/raw.js";

/** Numeric entries only; Sleeper stat values are numbers, anything else is noise. */
function numericStats(stats: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** gsis_id often has stray whitespace (ADR-006 item 5). Empty becomes null. */
function cleanGsis(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function mapPlayer(raw: RawPlayer): Player {
  const composed = [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim();
  return {
    playerId: raw.player_id,
    // DEF entries have no full_name: fall back to "first last", then to the id.
    fullName: raw.full_name?.trim() || composed || raw.player_id,
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    position: raw.position ?? null,
    fantasyPositions: raw.fantasy_positions ?? [],
    team: raw.team ?? null,
    status: raw.status ?? null,
    injuryStatus: raw.injury_status ?? null,
    injuryBodyPart: raw.injury_body_part ?? null,
    active: raw.active ?? null,
    age: raw.age ?? null,
    yearsExp: raw.years_exp ?? null,
    depthChartOrder: raw.depth_chart_order ?? null,
    searchRank: raw.search_rank ?? null,
    gsisId: cleanGsis(raw.gsis_id),
  };
}

export interface WeekContext {
  season: number;
  week: number;
  seasonType: SeasonType;
}

/** `fetchedAt` is an ISO 8601 string chosen by the caller (never read from the clock here). */
export function mapProjection(
  row: RawStatRow,
  ctx: WeekContext & { fetchedAt: string },
): PlayerWeekProjection {
  return {
    season: ctx.season,
    week: ctx.week,
    seasonType: ctx.seasonType,
    playerId: row.player_id,
    stats: numericStats(row.stats),
    opponent: row.opponent ?? null,
    fetchedAt: ctx.fetchedAt,
    source: "sleeper",
  };
}

export function mapStats(row: RawStatRow, ctx: WeekContext): PlayerWeekStats {
  return {
    season: ctx.season,
    week: ctx.week,
    seasonType: ctx.seasonType,
    playerId: row.player_id,
    stats: numericStats(row.stats),
    source: "sleeper",
  };
}

export function mapTrending(
  rows: RawTrending,
  ctx: { type: "add" | "drop"; lookbackHours: number; fetchedAt: string },
): TrendingEntry[] {
  return rows.map((r) => ({
    playerId: r.player_id,
    type: ctx.type,
    count: r.count,
    lookbackHours: ctx.lookbackHours,
    fetchedAt: ctx.fetchedAt,
  }));
}
