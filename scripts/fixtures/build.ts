/**
 * Pure fixture builder: raw (recorded) responses in, sanitized and trimmed fixture files out.
 * No I/O. `record.ts` fetches the raw data and writes the result.
 */
import { stringifyKeyed, stringifyRows, stringifyStable } from "./format.js";
import { findLeaks } from "./leak-check.js";
import {
  buildMapping,
  collectIdentifiers,
  fakeId,
  fakeLeagueId,
  fakeManagerName,
  sanitizeDoc,
  sanitizeDrafts,
  sanitizeUser,
  sanitizeUserLeagues,
  sanitizeUsers,
  SANITIZER_VERSION,
  SYNTHETIC_LEAGUE_ID,
  type IdentifierSet,
  type RawLeagueData,
} from "./sanitize.js";
import {
  collectReferencedPlayerIds,
  LEAKED_POSITIONS,
  playerNameCollides,
  PLACEHOLDER_SAMPLE_SIZE,
  PLAYER_FIELDS,
  projectPlayers,
  rowPlayerIds,
  selectPlayerIds,
  TOP_PLAYERS_BY_SEARCH_RANK,
  trimRows,
  type RowTrimStats,
} from "./trim.js";

export interface RecordedInput {
  season: string;
  currentWeek: number;
  /** ISO timestamp of when the data was fetched. */
  recordedAt: string;
  /** Real league id (from .env). */
  primaryLeagueId: string;
  state: unknown;
  user: unknown;
  userLeagues: unknown;
  league: unknown;
  users: unknown;
  rosters: unknown;
  matchups: Readonly<Record<number, unknown>>;
  transactions: Readonly<Record<number, unknown>>;
  tradedPicks: unknown;
  winnersBracket: unknown;
  losersBracket: unknown;
  drafts: unknown;
  /** Keyed by real draft id. */
  draftPicks: Readonly<Record<string, unknown>>;
  trendingAdd: unknown;
  trendingDrop: unknown;
  /** Full `GET /players/nfl` object. */
  players: Readonly<Record<string, unknown>>;
  projections: Readonly<Record<number, readonly unknown[]>>;
  stats: Readonly<Record<number, readonly unknown[]>>;
  /** Extra names or ids to include in the leak check (from .env). */
  extraNames?: readonly string[];
}

export interface BuildResult {
  /** Relative path to file text. */
  files: ReadonlyMap<string, string>;
  manifest: Record<string, unknown>;
  /** Original identifiers, for the leak check. Never written anywhere. */
  identifiers: IdentifierSet;
}

function numKeys(rec: Readonly<Record<number, unknown>>): number[] {
  return Object.keys(rec)
    .map(Number)
    .sort((a, b) => a - b);
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

function settingsOf(league: unknown): Record<string, unknown> {
  if (typeof league === "object" && league !== null && "settings" in league) {
    const s = league.settings;
    if (typeof s === "object" && s !== null) return s as Record<string, unknown>;
  }
  return {};
}

export function buildFixtureFiles(input: RecordedInput): BuildResult {
  const matchupWeeks = numKeys(input.matchups);
  const txWeeks = numKeys(input.transactions);
  const draftIdsReal = Object.keys(input.draftPicks);

  const raw: RawLeagueData = {
    user: input.user,
    userLeagues: input.userLeagues,
    league: input.league,
    users: input.users,
    rosters: input.rosters,
    drafts: input.drafts,
    draftPicks: draftIdsReal.map((id) => input.draftPicks[id]),
    transactions: txWeeks.map((w) => input.transactions[w]),
    extra: [
      ...matchupWeeks.map((w) => input.matchups[w]),
      input.tradedPicks,
      input.winnersBracket,
      input.losersBracket,
    ],
  };
  const mapping = buildMapping(raw, input.primaryLeagueId);
  const identifiers = collectIdentifiers(raw, input.primaryLeagueId, {
    ids: [input.primaryLeagueId],
    names: input.extraNames ?? [],
  });

  const userRecord =
    typeof input.user === "object" && input.user !== null
      ? (input.user as Record<string, unknown>)
      : {};
  const realUserId = typeof userRecord.user_id === "string" ? userRecord.user_id : "";
  const fakeUsername = fakeManagerName(mapping, realUserId);
  const fakeUserId = fakeId(mapping, realUserId);
  if (fakeUsername === null || fakeUserId === null) {
    throw new Error("account user id was not found among the league users or roster owners");
  }
  const leagueId = fakeLeagueId(mapping);

  const files = new Map<string, string>();
  const put = (path: string, text: string): void => {
    files.set(path, text);
  };
  const season = input.season;

  put("v1/state/nfl.json", stringifyStable(input.state));
  put(`v1/user/${fakeUsername}.json`, stringifyStable(sanitizeUser(input.user, mapping)));
  put(
    `v1/user/${fakeUserId}/leagues/nfl/${season}.json`,
    stringifyStable(sanitizeUserLeagues(input.userLeagues, mapping)),
  );
  const leagueBase = `v1/league/${leagueId}`;
  put(`${leagueBase}.json`, stringifyStable(sanitizeDoc(input.league, mapping)));
  put(`${leagueBase}/users.json`, stringifyStable(sanitizeUsers(input.users, mapping)));
  const rosters = sanitizeDoc(input.rosters, mapping);
  put(`${leagueBase}/rosters.json`, stringifyStable(rosters));
  const matchups: unknown[] = [];
  for (const w of matchupWeeks) {
    const doc = sanitizeDoc(input.matchups[w], mapping);
    matchups.push(doc);
    put(`${leagueBase}/matchups/${w}.json`, stringifyStable(doc));
  }
  const transactions: unknown[] = [];
  for (const w of txWeeks) {
    const doc = sanitizeDoc(input.transactions[w], mapping);
    transactions.push(doc);
    put(`${leagueBase}/transactions/${w}.json`, stringifyStable(doc));
  }
  put(`${leagueBase}/traded_picks.json`, stringifyStable(sanitizeDoc(input.tradedPicks, mapping)));
  put(
    `${leagueBase}/winners_bracket.json`,
    stringifyStable(sanitizeDoc(input.winnersBracket, mapping)),
  );
  put(
    `${leagueBase}/losers_bracket.json`,
    stringifyStable(sanitizeDoc(input.losersBracket, mapping)),
  );
  put(`${leagueBase}/drafts.json`, stringifyStable(sanitizeDrafts(input.drafts, mapping)));
  const draftPicks: unknown[] = [];
  const fakeDraftIds: string[] = [];
  for (const realId of draftIdsReal) {
    const fake = fakeId(mapping, realId);
    if (fake === null) throw new Error("draft id missing from mapping");
    fakeDraftIds.push(fake);
    const doc = sanitizeDoc(input.draftPicks[realId], mapping);
    draftPicks.push(doc);
    put(`v1/draft/${fake}/picks.json`, stringifyStable(doc));
  }
  const trendingAdd = sanitizeDoc(input.trendingAdd, mapping);
  const trendingDrop = sanitizeDoc(input.trendingDrop, mapping);
  put("v1/players/nfl/trending/add.json", stringifyRows(asList(trendingAdd)));
  put("v1/players/nfl/trending/drop.json", stringifyRows(asList(trendingDrop)));

  // Players and weekly rows (public data, no identifiers).
  const referenced = collectReferencedPlayerIds({
    rosters,
    matchups,
    transactions,
    draftPicks,
    trending: [trendingAdd, trendingDrop],
  });
  const playerSet = selectPlayerIds(input.players, referenced);
  const rowStats: Record<string, RowTrimStats> = {};
  const trimmed: { path: string; rows: unknown[] }[] = [];
  for (const [kind, byWeek] of [
    ["projections", input.projections],
    ["stats", input.stats],
  ] as const) {
    for (const w of numKeys(byWeek)) {
      const result = trimRows(byWeek[w] ?? [], playerSet);
      const path = `${kind}/${season}/${w}.json`;
      rowStats[`${kind}/${season}/${w}`] = result.stats;
      trimmed.push({ path, rows: result.rows });
      for (const id of rowPlayerIds(result.rows)) if (id in input.players) playerSet.add(id);
    }
  }
  for (const t of trimmed) put(t.path, stringifyRows(t.rows));
  let collisionExcluded = 0;
  for (const id of [...playerSet]) {
    if (!referenced.has(id) && playerNameCollides(input.players[id], identifiers.names)) {
      playerSet.delete(id);
      collisionExcluded += 1;
    }
  }
  const players = projectPlayers(input.players, playerSet);
  put("v1/players/nfl.json", stringifyKeyed(players));

  const settings = settingsOf(input.league);
  const lastScored = typeof settings.last_scored_leg === "number" ? settings.last_scored_leg : 0;
  const playoffStart =
    typeof settings.playoff_week_start === "number" ? settings.playoff_week_start : 15;
  const weeks = range(1, Math.min(lastScored, input.currentWeek));
  const partialWeeks = range(Math.max(lastScored, 0) + 1, input.currentWeek).filter((w) =>
    matchupWeeks.includes(w),
  );
  const futureMatchupWeeks = matchupWeeks.filter((w) => w > input.currentWeek && w < playoffStart);

  const manifest: Record<string, unknown> = {
    currentWeek: input.currentWeek,
    draftIds: fakeDraftIds,
    futureMatchupWeeks,
    leagueId: leagueId,
    partialWeeks,
    projectionWeeks: numKeys(input.projections),
    recordedAt: input.recordedAt,
    sanitizerVersion: SANITIZER_VERSION,
    season,
    statsWeeks: numKeys(input.stats),
    syntheticLeagueId: SYNTHETIC_LEAGUE_ID,
    trimming: {
      players: {
        rule: `rostered + referenced in any fixture + top ${TOP_PLAYERS_BY_SEARCH_RANK} by search_rank + all DEF + every player in a kept projections or stats row`,
        sourceCount: Object.keys(input.players).length,
        keptCount: Object.keys(players).length,
        excludedForNameCollision: collisionExcluded,
        fields: [...PLAYER_FIELDS],
      },
      rows: {
        rule: `keep every real row (stats.gp present), every row whose player_id is in the players set, every leaked-position row (${LEAKED_POSITIONS.join("/")}), plus ${PLACEHOLDER_SAMPLE_SIZE} evenly spaced placeholder rows per week (sorted by player_id)`,
        perWeek: rowStats,
      },
      sanitizer:
        "ids, usernames, display names, team names, avatars, league and draft names replaced with deterministic fakes; user object reduced to user_id, username, display_name, avatar, is_bot; second league entry in the user league list is synthetic",
    },
    userId: fakeUserId,
    username: fakeUsername,
    weeks,
  };
  put("manifest.json", stringifyStable(manifest));

  // Refuse to hand back files that still contain an original identifier.
  const leaks = findLeaks(
    [...files].map(([path, text]) => ({ path, text })),
    identifiers,
  );
  if (leaks.length > 0) {
    const detail = leaks.map((l) => `${l.file} (${l.category} #${l.index})`).join(", ");
    throw new Error(`sanitizer left original identifiers in output: ${detail}`);
  }
  return { files, manifest, identifiers };
}

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}
