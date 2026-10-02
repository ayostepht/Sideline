import { getSleeperUserId, lastSuccessAt, readNflState, type DbHandle } from "@sideline/db";
import {
  compareStandings,
  computeFreshness,
  SYNC_CADENCE_MS,
  type Freshness,
  type LeagueOverview,
  type PlayerSearchResult,
  type StandingsResponse,
  type StandingsRow,
  type TeamDetail,
  type TeamPlayerRow,
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

interface LeagueRow {
  league_id: string;
  season: number;
  name: string;
  status: string;
  roster_positions_json: string;
  total_rosters: number;
  playoff_week_start: number | null;
  waiver_type: number | null;
  divisions: number | null;
}

function readLeague(h: DbHandle, leagueId: string): LeagueRow | null {
  const row = h.sqlite
    .prepare(
      `SELECT league_id, season, name, status, roster_positions_json, total_rosters,
              playoff_week_start, waiver_type, divisions
       FROM leagues WHERE league_id = ?`,
    )
    .get(leagueId) as LeagueRow | undefined;
  return row ?? null;
}

const freshnessFor = (h: DbHandle, job: "league" | "rosters", now: Date): Freshness =>
  computeFreshness(lastSuccessAt(h, job), SYNC_CADENCE_MS[job], now.getTime());

export function getLeagueOverview(
  h: DbHandle,
  leagueId: string,
  now: Date,
): Lookup<LeagueOverview> {
  const l = readLeague(h, leagueId);
  if (l === null) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    data: {
      leagueId: l.league_id,
      name: l.name,
      season: l.season,
      status: l.status,
      currentWeek: readNflState(h)?.week ?? null,
      totalRosters: l.total_rosters,
      rosterPositions: parseList(l.roster_positions_json),
      playoffWeekStart: l.playoff_week_start,
      waiverType: l.waiver_type,
      hasDivisions: (l.divisions ?? 0) > 0,
      freshness: freshnessFor(h, "league", now),
    },
  };
}

interface RosterRow {
  roster_id: number;
  owner_id: string | null;
  players_json: string;
  starters_json: string;
  reserve_json: string;
  taxi_json: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_against: number;
  display_name: string | null;
  team_name: string | null;
  avatar: string | null;
}

function readRosters(h: DbHandle, leagueId: string): RosterRow[] {
  return h.sqlite
    .prepare(
      `SELECT r.roster_id, r.owner_id, r.players_json, r.starters_json, r.reserve_json, r.taxi_json,
              r.wins, r.losses, r.ties, r.fpts, r.fpts_against,
              u.display_name, u.team_name, u.avatar
       FROM rosters r
       LEFT JOIN league_users u ON u.league_id = r.league_id AND u.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as RosterRow[];
}

function nonBlank(v: string | null): string | null {
  return v !== null && v.trim() !== "" ? v : null;
}

function teamNameOf(r: RosterRow): string {
  return nonBlank(r.team_name) ?? nonBlank(r.display_name) ?? `Team ${r.roster_id}`;
}

/**
 * Marks one roster as the stored user's: the lowest roster_id they own. Co-owners are not
 * considered in Phase 2 (only `owner_id` is read), so a user owning two rosters gets one.
 */
function rankRows(rows: RosterRow[], userId: string | null): StandingsRow[] {
  const mineRosterId =
    userId === null
      ? null
      : rows
          .filter((r) => r.owner_id === userId)
          .reduce<number | null>((m, r) => (m === null || r.roster_id < m ? r.roster_id : m), null);
  const mapped = rows.map((r) => ({
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    teamName: teamNameOf(r),
    managerName: nonBlank(r.display_name),
    avatar: r.avatar,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    pointsFor: r.fpts,
    pointsAgainst: r.fpts_against,
    // Rosters do not store a division yet; see report (needs a db and worker change).
    division: null,
    isMine: userId !== null && r.roster_id === mineRosterId,
  }));
  mapped.sort(compareStandings);
  return mapped.map((m, i) => ({ ...m, rank: i + 1 }));
}

export function getStandings(h: DbHandle, leagueId: string, now: Date): Lookup<StandingsResponse> {
  if (readLeague(h, leagueId) === null) return { ok: false, reason: "not_found" };
  const rows = rankRows(readRosters(h, leagueId), getSleeperUserId(h));
  return { ok: true, data: { rows, freshness: freshnessFor(h, "rosters", now) } };
}

const NON_STARTER_POSITIONS = new Set(["BN", "IR", "TAXI"]);

interface PlayerRow {
  player_id: string;
  full_name: string;
  position: string | null;
  fantasy_positions_json: string;
  team: string | null;
  status: string | null;
  injury_status: string | null;
  injury_body_part: string | null;
}

function readPlayers(h: DbHandle, ids: string[]): Map<string, PlayerRow> {
  const out = new Map<string, PlayerRow>();
  if (ids.length === 0) return out;
  const marks = ids.map(() => "?").join(",");
  const rows = h.sqlite
    .prepare(
      `SELECT player_id, full_name, position, fantasy_positions_json, team, status,
              injury_status, injury_body_part
       FROM players WHERE player_id IN (${marks})`,
    )
    .all(...ids) as PlayerRow[];
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
  // An incomplete schedule would make every team look like it has byes.
  if (allWeeks.size < 18) return out;
  for (const [team, weeks] of byTeam) {
    const absent = [...allWeeks].filter((w) => !weeks.has(w));
    if (absent.length === 1 && absent[0] !== undefined) out.set(team, absent[0]);
  }
  return out;
}

function buildTeamDetail(
  h: DbHandle,
  league: LeagueRow,
  row: RosterRow,
  roster: StandingsRow,
  freshness: Freshness,
): TeamDetail {
  const starters = parseList(row.starters_json);
  const reserve = parseList(row.reserve_json);
  const taxi = parseList(row.taxi_json);
  const all = parseList(row.players_json);
  const labels = parseList(league.roster_positions_json).filter(
    (p) => !NON_STARTER_POSITIONS.has(p),
  );
  const ids = new Set<string>([...starters, ...reserve, ...taxi, ...all]);
  ids.delete("0");
  const players = readPlayers(h, [...ids]);
  const byes = readByeWeeks(h, league.season);

  const toRow = (
    playerId: string,
    slot: TeamPlayerRow["slot"],
    starterSlot: string | null,
  ): TeamPlayerRow => {
    const p = players.get(playerId);
    return {
      playerId,
      name: p?.full_name ?? playerId,
      position: p?.position ?? null,
      fantasyPositions: p === undefined ? [] : parseList(p.fantasy_positions_json),
      nflTeam: p?.team ?? null,
      status: p?.status ?? null,
      injuryStatus: p?.injury_status ?? null,
      injuryBodyPart: p?.injury_body_part ?? null,
      byeWeek: p?.team != null ? (byes.get(p.team) ?? null) : null,
      slot,
      starterSlot,
    };
  };

  const out: TeamPlayerRow[] = [];
  const emptySlots: string[] = [];
  starters.forEach((id, i) => {
    const label = labels[i] ?? null;
    if (id === "0") emptySlots.push(label ?? "Empty");
    else out.push(toRow(id, "starter", label));
  });
  const used = new Set([...starters, ...reserve, ...taxi]);
  for (const id of all) if (!used.has(id)) out.push(toRow(id, "bench", null));
  for (const id of reserve) out.push(toRow(id, "ir", null));
  for (const id of taxi) out.push(toRow(id, "taxi", null));
  return { roster, players: out, emptySlots, freshness };
}

export function getTeamDetail(
  h: DbHandle,
  leagueId: string,
  rosterId: number,
  now: Date,
): Lookup<TeamDetail> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };
  const rows = readRosters(h, leagueId);
  const row = rows.find((r) => r.roster_id === rosterId);
  if (row === undefined) return { ok: false, reason: "not_found" };
  const standing = rankRows(rows, getSleeperUserId(h)).find((s) => s.rosterId === rosterId);
  if (standing === undefined) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    data: buildTeamDetail(h, league, row, standing, freshnessFor(h, "rosters", now)),
  };
}

/**
 * The stored user's team in this league; `no_team` when no user is stored or they have no roster.
 * With several owned rosters the lowest roster_id wins. Co-owners are not considered in Phase 2.
 */
export function getMyTeam(h: DbHandle, leagueId: string, now: Date): Lookup<TeamDetail> {
  if (readLeague(h, leagueId) === null) return { ok: false, reason: "not_found" };
  const userId = getSleeperUserId(h);
  if (userId === null) return { ok: false, reason: "no_team" };
  const mine = h.sqlite
    .prepare(
      "SELECT roster_id AS id FROM rosters WHERE league_id = ? AND owner_id = ? ORDER BY roster_id LIMIT 1",
    )
    .get(leagueId, userId) as { id: number } | undefined;
  if (mine === undefined) return { ok: false, reason: "no_team" };
  return getTeamDetail(h, leagueId, mine.id, now);
}

interface SearchRow {
  player_id: string;
  full_name: string;
  position: string | null;
  team: string | null;
  injury_status: string | null;
}

/**
 * Case-insensitive name match. Names where any word starts with the query rank first, then
 * search_rank ascending (nulls last), then name. Owner comes from this league's rosters.
 */
export function searchPlayers(
  h: DbHandle,
  leagueId: string,
  q: string,
  limit: number,
): Lookup<PlayerSearchResult[]> {
  if (readLeague(h, leagueId) === null) return { ok: false, reason: "not_found" };
  const needle = q.trim().toLowerCase();
  const rows = h.sqlite
    .prepare(
      `SELECT player_id, full_name, position, team, injury_status FROM players
       WHERE instr(lower(full_name), (:needle)) > 0
       ORDER BY
         CASE WHEN substr(lower(full_name), 1, length((:needle))) = (:needle)
                OR instr(lower(full_name), ' ' || (:needle)) > 0 THEN 0 ELSE 1 END,
         search_rank IS NULL, search_rank, full_name, player_id
       LIMIT :lim`,
    )
    .all({ needle, lim: limit }) as SearchRow[];
  const owners = new Map<string, { rosterId: number; teamName: string }>();
  for (const r of readRosters(h, leagueId)) {
    const owner = { rosterId: r.roster_id, teamName: teamNameOf(r) };
    for (const id of [
      ...parseList(r.players_json),
      ...parseList(r.reserve_json),
      ...parseList(r.taxi_json),
    ]) {
      owners.set(id, owner);
    }
  }
  return {
    ok: true,
    data: rows.map((r) => ({
      playerId: r.player_id,
      name: r.full_name,
      position: r.position,
      nflTeam: r.team,
      injuryStatus: r.injury_status,
      owner: owners.get(r.player_id) ?? null,
    })),
  };
}
