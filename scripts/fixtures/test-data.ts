/**
 * Synthetic "real" league data for the fixture tooling tests. Every value here is invented; none
 * comes from a real account. The shapes mirror docs/sleeper-api-notes.md.
 */
import type { RecordedInput } from "./build.js";
import type { RawLeagueData } from "./sanitize.js";

export const REAL = {
  leagueId: "2000000000000000001",
  otherLeagueId: "2000000000000000002",
  draftId: "2000000000000000003",
  userA: "200000000000000002", // roster 2 owner (the account)
  userB: "200000000000000001", // roster 1 owner
  userC: "200000000000000003", // roster 3 owner, co-owner of roster 1
  username: "zoe_realname",
  displayA: "ZoeRealName",
  displayB: "Brontosaurus Bob",
  displayC: "Qu",
  teamA: "Gridiron Goblins",
  teamB: "Sunday Scaries",
  leagueName: "The Real Money League",
  otherLeagueName: "Secret Office Pool",
  avatarA: "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
  avatarUrlB: "https://sleepercdn.com/avatars/thumbs/0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  txId: "2000000000000000301",
  txIdB: "2000000000000000302",
  messageId: "2000000000000000999",
} as const;

export function syntheticRaw(): RawLeagueData {
  return {
    user: {
      avatar: REAL.avatarA,
      cookies: null,
      created: null,
      display_name: REAL.displayA,
      email: "zoe@example.org",
      is_bot: false,
      metadata: null,
      phone: "555-0100",
      real_name: "Zoe Realname",
      summoner_name: null,
      token: "tok_abc",
      user_id: REAL.userA,
      username: REAL.username,
      verification: null,
    },
    userLeagues: [
      {
        league_id: REAL.otherLeagueId,
        name: REAL.otherLeagueName,
        draft_id: "2000000000000000004",
        avatar: null,
        last_author_display_name: REAL.displayB,
        last_author_id: REAL.userB,
        last_message_text_map: { en: `hello from ${REAL.leagueName}` },
        display_order: 0,
      },
      {
        league_id: REAL.leagueId,
        name: REAL.leagueName,
        draft_id: REAL.draftId,
        avatar: null,
        last_author_display_name: REAL.displayB,
        last_author_id: REAL.userB,
        last_message_id: REAL.messageId,
        last_message_text_map: null,
        last_transaction_id: REAL.txId,
        display_order: 1,
      },
    ],
    league: {
      league_id: REAL.leagueId,
      name: REAL.leagueName,
      avatar: null,
      draft_id: REAL.draftId,
      previous_league_id: null,
      status: "in_season",
      season: "2026",
      total_rosters: 3,
      last_message_id: REAL.messageId,
      last_author_id: REAL.userB,
      last_author_display_name: REAL.displayB,
      scoring_settings: { rec: 1, pass_yd: 0.04, rush_yd: 0.1 },
      settings: { last_scored_leg: 2, playoff_week_start: 15, num_teams: 3 },
    },
    users: [
      {
        user_id: REAL.userC,
        display_name: REAL.displayC,
        avatar: null,
        league_id: REAL.leagueId,
        metadata: { allow_pn: "on" },
      },
      {
        user_id: REAL.userA,
        display_name: REAL.displayA,
        avatar: REAL.avatarA,
        league_id: REAL.leagueId,
        metadata: { team_name: REAL.teamA, avatar: REAL.avatarUrlB },
      },
      {
        user_id: REAL.userB,
        display_name: REAL.displayB,
        avatar: "ffffffffffffffffffffffffffffffff",
        league_id: REAL.leagueId,
        metadata: { team_name: REAL.teamB },
      },
    ],
    rosters: [
      {
        roster_id: 3,
        owner_id: REAL.userC,
        co_owners: null,
        league_id: REAL.leagueId,
        players: ["1001", "ATL"],
        starters: ["1001", "ATL"],
        reserve: null,
      },
      {
        roster_id: 1,
        owner_id: REAL.userB,
        co_owners: [REAL.userC],
        league_id: REAL.leagueId,
        players: ["1002", "1003"],
        starters: ["1002", "0"],
        reserve: ["1003"],
      },
      {
        roster_id: 2,
        owner_id: REAL.userA,
        co_owners: null,
        league_id: REAL.leagueId,
        players: ["1004"],
        starters: ["1004"],
        reserve: null,
      },
    ],
    drafts: [
      {
        draft_id: REAL.draftId,
        league_id: REAL.leagueId,
        creators: [REAL.userB],
        draft_order: { [REAL.userA]: 1, [REAL.userB]: 2, [REAL.userC]: 3 },
        last_message_id: "2000000000000000888",
        metadata: {
          name: REAL.leagueName,
          description: `Welcome to ${REAL.leagueName}, ${REAL.displayB} is commish`,
          scoring_type: "ppr",
        },
        settings: { rounds: 15 },
      },
    ],
    draftPicks: [
      [
        {
          draft_id: REAL.draftId,
          picked_by: REAL.userA,
          player_id: "1004",
          roster_id: 2,
          metadata: { first_name: "Pat", last_name: "Player" },
        },
      ],
    ],
    transactions: [
      [
        {
          type: "waiver",
          status: "complete",
          leg: 1,
          creator: REAL.userA,
          transaction_id: REAL.txId,
          adds: { "1005": 2 },
          drops: { "1004": 2 },
          roster_ids: [2],
          consenter_ids: [2],
          metadata: { notes: "Your waiver claim was processed successfully!" },
        },
        {
          type: "free_agent",
          status: "complete",
          leg: 1,
          creator: REAL.userB,
          transaction_id: REAL.txIdB,
          adds: null,
          drops: { "1002": 1 },
          roster_ids: [1],
          consenter_ids: [1],
          metadata: null,
        },
      ],
      [],
    ],
    extra: [],
  };
}

function matchupWeek(week: number): unknown[] {
  const scored = week <= 2;
  return [
    {
      roster_id: 1,
      matchup_id: 1,
      points: scored ? 10 : 0,
      players: ["1002", "1003"],
      starters: ["1002", "0"],
      starters_points: scored ? [10, 0] : [0, 0],
      players_points: scored ? { "1002": 10, "1003": 0 } : { "1002": 0, "1003": 0 },
    },
    {
      roster_id: 2,
      matchup_id: 1,
      points: scored ? 6.5 : 0,
      players: ["1004"],
      starters: ["1004"],
      starters_points: [scored ? 6.5 : 0],
      players_points: { "1004": scored ? 6.5 : 0 },
    },
  ];
}

function row(
  playerId: string,
  position: string,
  week: number,
  stats: Record<string, number>,
): unknown {
  return {
    player_id: playerId,
    week,
    season: "2026",
    category: "stat",
    stats,
    player: { position, first_name: "Pat", last_name: `P${playerId}` },
  };
}

function weekRows(week: number): unknown[] {
  return [
    row("1002", "RB", week, { gp: 1, rush_yd: 100 }),
    row("1004", "WR", week, { gp: 1, rec: 5, rec_yd: 15 }),
    row("1005", "TE", week, { adp_dd_ppr: 120 }),
    row("1006", "FB", week, { adp_dd_ppr: 300 }),
    row("1007", "WR", week, { adp_dd_ppr: 301 }),
    row("ATL", "DEF", week, { sack: 2 }),
  ];
}

export function syntheticPlayers(): Record<string, unknown> {
  const mk = (id: string, name: [string, string], position: string, rank: number): unknown => ({
    player_id: id,
    first_name: name[0],
    last_name: name[1],
    full_name: `${name[0]} ${name[1]}`,
    search_full_name: `${name[0]}${name[1]}`.toLowerCase(),
    position,
    fantasy_positions: [position],
    team: "ATL",
    status: "Active",
    injury_status: null,
    active: true,
    search_rank: rank,
    years_exp: 3,
    college: "Should Be Dropped",
    metadata: { junk: true },
  });
  return {
    "1001": mk("1001", ["Quinn", "Passer"], "QB", 9_999_999),
    "1002": mk("1002", ["Ray", "Runner"], "RB", 9_999_999),
    "1003": mk("1003", ["Will", "Receiver"], "WR", 9_999_999),
    "1004": mk("1004", ["Tim", "Tight"], "WR", 9_999_999),
    "1005": mk("1005", ["Top", "Ranked"], "TE", 1),
    "1006": mk("1006", ["Fred", "Fullback"], "FB", 9_999_999),
    "1007": mk("1007", ["Zed", "Zero"], "WR", 9_999_999),
    // A player whose name matches a real team name (unreferenced), to test collision exclusion.
    "1008": mk("1008", ["Gridiron", "Goblins"], "WR", 2),
    ATL: {
      player_id: "ATL",
      first_name: "Atlanta",
      last_name: "Falcons",
      position: "DEF",
      team: "ATL",
      fantasy_positions: ["DEF"],
      active: true,
    },
    BAL: {
      player_id: "BAL",
      position: "DEF",
      team: "BAL",
      first_name: "Baltimore",
      last_name: "Ravens",
    },
  };
}

export function syntheticInput(): RecordedInput {
  const matchups: Record<number, unknown> = {};
  for (let w = 1; w <= 4; w += 1) matchups[w] = matchupWeek(w);
  const projections: Record<number, readonly unknown[]> = {};
  const stats: Record<number, readonly unknown[]> = {};
  for (let w = 1; w <= 3; w += 1) projections[w] = weekRows(w);
  for (let w = 1; w <= 2; w += 1) stats[w] = weekRows(w);
  const raw = syntheticRaw();
  return {
    season: "2026",
    currentWeek: 3,
    recordedAt: "2026-10-01T12:00:00.000Z",
    primaryLeagueId: REAL.leagueId,
    state: { week: 3, season: "2026", season_type: "regular" },
    user: raw.user,
    userLeagues: raw.userLeagues,
    league: raw.league,
    users: raw.users,
    rosters: raw.rosters,
    matchups,
    transactions: { 1: raw.transactions[0], 2: raw.transactions[1] },
    tradedPicks: [],
    winnersBracket: [],
    losersBracket: [],
    drafts: raw.drafts,
    draftPicks: { [REAL.draftId]: raw.draftPicks[0] },
    trendingAdd: [{ player_id: "1007", count: 10 }],
    trendingDrop: [],
    players: syntheticPlayers(),
    projections,
    stats,
    extraNames: [REAL.username],
  };
}
