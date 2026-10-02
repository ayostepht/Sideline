import { z } from "zod";

/**
 * Raw Sleeper response schemas. Each requires only the fields we use and tolerates extras
 * (`z.object` strips unknown keys, `z.looseObject` keeps them). Nullable where api-notes shows
 * nulls. Chat state and personal fields on users and leagues are stripped on purpose so they
 * can never reach a database or a log.
 */

export const RawStateSchema = z.object({
  season: z.string(),
  week: z.number().int(),
  season_type: z.enum(["pre", "regular", "post", "off"]),
  display_week: z.number().int().optional(),
  leg: z.number().int().optional(),
  previous_season: z.string().nullish(),
  season_start_date: z.string().nullish(),
});
export type RawState = z.infer<typeof RawStateSchema>;

/** `GET /user/{username}` returns 200 with body `null` for an unknown user. */
export const RawUserSchema = z
  .object({
    user_id: z.string(),
    display_name: z.string(),
    username: z.string().nullish(),
    avatar: z.string().nullish(),
    is_bot: z.boolean().nullish(),
  })
  .nullable();
export type RawUser = z.infer<typeof RawUserSchema>;

export const RawLeagueSchema = z.object({
  league_id: z.string(),
  name: z.string(),
  status: z.string(),
  season: z.string(),
  previous_league_id: z.string().nullish(),
  total_rosters: z.number().int(),
  roster_positions: z.array(z.string()).nullish(),
  scoring_settings: z.record(z.string(), z.number()),
  /** Mixed value types in practice; the mapper keeps numeric entries only. */
  settings: z.record(z.string(), z.unknown()),
});
export type RawLeague = z.infer<typeof RawLeagueSchema>;

export const RawLeagueUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  avatar: z.string().nullish(),
  metadata: z.looseObject({ team_name: z.string().nullish() }).nullish(),
});
export type RawLeagueUser = z.infer<typeof RawLeagueUserSchema>;

export const RawRosterSchema = z.object({
  roster_id: z.number().int(),
  owner_id: z.string().nullish(),
  players: z.array(z.string()).nullish(),
  starters: z.array(z.string()).nullish(),
  reserve: z.array(z.string()).nullish(),
  taxi: z.array(z.string()).nullish(),
  settings: z
    .object({
      wins: z.number().optional(),
      losses: z.number().optional(),
      ties: z.number().optional(),
      fpts: z.number().optional(),
      fpts_decimal: z.number().optional(),
      fpts_against: z.number().optional(),
      fpts_against_decimal: z.number().optional(),
      waiver_position: z.number().nullish(),
      waiver_budget_used: z.number().nullish(),
    })
    .nullish(),
});
export type RawRoster = z.infer<typeof RawRosterSchema>;

export const RawMatchupSchema = z.object({
  roster_id: z.number().int(),
  matchup_id: z.number().int().nullish(),
  points: z.number().nullish(),
  starters: z.array(z.string()).nullish(),
  starters_points: z.array(z.number().nullable()).nullish(),
  players: z.array(z.string()).nullish(),
  players_points: z.record(z.string(), z.number().nullable()).nullish(),
});
export type RawMatchup = z.infer<typeof RawMatchupSchema>;

const rosterMap = z.record(z.string(), z.number().int()).nullish();

export const RawTransactionSchema = z.object({
  transaction_id: z.string(),
  type: z.string(),
  status: z.string(),
  leg: z.number().int(),
  created: z.number().int(),
  status_updated: z.number().int().nullish(),
  creator: z.string().nullish(),
  adds: rosterMap,
  drops: rosterMap,
  roster_ids: z.array(z.number().int()).nullish(),
  consenter_ids: z.array(z.number().int()).nullish(),
  settings: z.looseObject({ waiver_bid: z.number().nullish() }).nullish(),
  draft_picks: z.array(z.record(z.string(), z.unknown())).nullish(),
  waiver_budget: z
    .array(z.object({ sender: z.number().int(), receiver: z.number().int(), amount: z.number() }))
    .nullish(),
});
export type RawTransaction = z.infer<typeof RawTransactionSchema>;

/** Shapes without a shared domain type yet: validated loosely and returned as is. */
/** Traded pick rows were never observed (empty array), so nothing is required yet. */
export const RawTradedPickSchema = z.looseObject({});
export const RawBracketRowSchema = z.looseObject({
  r: z.number().int(),
  m: z.number().int(),
  w: z.number().int().nullish(),
  l: z.number().int().nullish(),
  t1: z.number().int().nullish(),
  t2: z.number().int().nullish(),
});
export const RawDraftSchema = z.looseObject({
  draft_id: z.string(),
  status: z.string(),
  season: z.string(),
  type: z.string(),
});
export const RawDraftPickSchema = z.looseObject({
  pick_no: z.number().int(),
  round: z.number().int(),
  player_id: z.string(),
  roster_id: z.number().int().nullish(),
  picked_by: z.string().nullish(),
});

export const RawPlayerSchema = z.object({
  player_id: z.string(),
  full_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  position: z.string().nullish(),
  fantasy_positions: z.array(z.string()).nullish(),
  team: z.string().nullish(),
  status: z.string().nullish(),
  injury_status: z.string().nullish(),
  injury_body_part: z.string().nullish(),
  active: z.boolean().nullish(),
  age: z.number().nullish(),
  years_exp: z.number().nullish(),
  depth_chart_order: z.number().nullish(),
  search_rank: z.number().nullish(),
  gsis_id: z.string().nullish(),
});
export type RawPlayer = z.infer<typeof RawPlayerSchema>;

/** The players endpoint is validated per entry by the client, so the envelope is a loose map. */
export const RawPlayersEnvelopeSchema = z.record(z.string(), z.unknown());

export const RawTrendingSchema = z.array(
  z.object({ player_id: z.string(), count: z.number().int() }),
);
export type RawTrending = z.infer<typeof RawTrendingSchema>;

/**
 * Projection and stats rows (undocumented endpoints). Rows are validated one at a time by the
 * client, so one bad row never fails the week. `stats` values are kept `unknown` here; the
 * mapper keeps numeric entries.
 */
export const RawStatRowSchema = z.object({
  player_id: z.string(),
  stats: z.record(z.string(), z.unknown()),
  opponent: z.string().nullish(),
  team: z.string().nullish(),
  player: z.looseObject({ position: z.string().nullish(), team: z.string().nullish() }).nullish(),
});
export type RawStatRow = z.infer<typeof RawStatRowSchema>;
export const RawStatRowsEnvelopeSchema = z.array(z.unknown());
