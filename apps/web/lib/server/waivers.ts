/**
 * WAIVER-1..WAIVER-6d (PLAN 5.6, T4.5b): assembles the waiver candidate pool and the rolling-
 * priority advisor from real league data, calls the pure analytics in `@sideline/core`
 * (`buildCandidatePool`, `prefilterCandidates`, `computeLineupImpact`, `computeWaiverScore`,
 * `sortForMyTeam`/`sortBestAvailable`, and the WAIVER-6 priority-advisor functions), and maps the
 * result to the `WaiverResponse` DTO. Cached in `computed_cache`, keyed by a hash of the sync jobs
 * that could change the answer (rosters, stats, projections, trending, nflverse).
 *
 * No analytics logic lives here beyond two small, pure, documented helpers this module owns
 * because they are judgment calls PLAN leaves to the implementer, not `@sideline/core` concerns:
 * {@link percentiles} (percentile normalization across a candidate set, WAIVER-3) and
 * {@link scheduleStrength} (the next-3-weeks schedule proxy, WAIVER-3's "schedule" component).
 * Every other scoring/optimizer/trend decision is delegated to `@sideline/core`.
 *
 * ## Caching (house pattern, see `lineup.ts`)
 * The expensive computation (candidate pool, prefilter, per-candidate Lineup Impact/percentiles/
 * Waiver Score, and the priority advisor) is independent of the request's position filter, so the
 * cache key (`kind = "waivers:<rosterId>"`) does not include it: `getWaivers` caches the full
 * unfiltered candidate list plus the priority advisor, and applies `sortForMyTeam`/
 * `sortBestAvailable`'s position filter in memory on every call, cache hit or not.
 */
import { createHash } from "node:crypto";
import {
  buildCandidatePool,
  computeClaimAdvice,
  computeCompetingClaims,
  computeLineupImpact,
  computeNextWaiverClear,
  computeScoringTrend,
  computeTrendSignal,
  computeTrendingMomentum,
  computeUsageTrend,
  computeWaiverOrder,
  computeWaiverScore,
  DEFAULT_COMPETING_NEED_THRESHOLD,
  DEFAULT_LINEUP_IMPACT_WEEK_COUNT,
  DEFAULT_SEASON_WEEKS,
  prefilterCandidates,
  PREFILTER_POOL_SIZE,
  resolveSlots,
  restOfSeasonProjection,
  sortBestAvailable,
  sortForMyTeam,
  type CompetingTeamRosterInput,
  type FailedClaimRecord,
  type LineupImpactCandidate,
  type LineupImpactRosterPlayer,
  type MomentumLabel,
  type RestOfSeasonWeek,
  type TrendSignal,
} from "@sideline/core";
import {
  getComputed,
  getSleeperUserId,
  lastSuccessAt,
  putComputed,
  readNflState,
  readPlayers,
  readRosteredPlayerIds,
  readTrending,
  readUsageWeek,
  type DbHandle,
  type FullPlayerRow,
} from "@sideline/db";
import {
  computeFreshness,
  FreshnessSchema,
  ReasonSchema,
  SYNC_CADENCE_MS,
  WaiverCandidateSchema,
  WaiverModeSchema,
  WaiverPriorityAdvisorSchema,
  WaiverResponseSchema,
  type Freshness,
  type Player,
  type Reason,
  type WaiverCandidate,
  type WaiverPriorityAdvisor,
  type WaiverResponse,
} from "@sideline/shared";
import { z } from "zod";

export type Lookup<T> = { ok: true; data: T } | { ok: false; reason: "not_found" | "no_team" };

/**
 * How many of the top-scoring candidates get the expensive priority-advisor treatment (WAIVER-6b/
 * 6c: `computeCompetingClaims` against every team ahead of me, `computeClaimAdvice` for my own
 * claim). Running this for the full prefiltered ~75 would multiply `computeLineupImpact` calls by
 * the number of teams ahead of me (up to `totalRosters - 1`) on top of the ~75 already spent on the
 * two views; 20 keeps the worst case bounded (20 candidates x ~11 teams x 2 solves x 3 weeks, a
 * small fraction of WAIVER-2's own 75-candidate x 2s budget) while still covering every candidate a
 * user would realistically consider claiming.
 */
export const WAIVER_PRIORITY_CANDIDATE_CAP = 20;

/**
 * Waiver position used for a team with no `waiver_position` set (unusual, but not assumed away):
 * sorts last, deterministically, among other such teams (via `computeWaiverOrder`'s ascending-
 * teamId tiebreak).
 */
const UNSET_WAIVER_POSITION = Number.MAX_SAFE_INTEGER;

const StringList = z.array(z.string());

function parseList(raw: string): string[] {
  try {
    const r = StringList.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sleeper uses `LAR`; nflverse (`schedule`, `defense_vs_position`) uses `LA`. Mirrors `lineup.ts`. */
function toNflverseTeam(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}

/** Asserts `arr[index]` is defined; every call site here indexes within a loop bound derived from
 * the same array's own length, so the thrown branch is unreachable in practice (mirrors the
 * identical helper in `packages/core`'s `lineup-impact.ts`/`solve.ts`). */
function at<T>(arr: readonly T[], index: number): T {
  const v = arr[index];
  if (v === undefined) throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  return v;
}

function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(`missing key ${String(key)}`);
  return v;
}

// ---------------------------------------------------------------------------
// Percentile normalization (WAIVER-3)
// ---------------------------------------------------------------------------

/**
 * WAIVER-3's percentile normalization: fractional (average-rank) percentile, 0 to 100. Ties share
 * the average percentile of their tied rank span (e.g. two tied-lowest values of four both get
 * percentile `(0 + 1) / 2 / 3 * 100`). A single-candidate set gets percentile 100 - trivially the
 * best of one, since there is nothing to compare against. Order of `values` is preserved: the
 * result's `i`-th entry is `values[i]`'s percentile.
 */
// Exported for testing only (T4.5b-FIX M3): no other module should import this directly, it is an
// internal helper of `computeWaivers`.
export function percentiles(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const order = values.map((_, i) => i).sort((a, b) => at(values, a) - at(values, b));
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && at(values, at(order, j + 1)) === at(values, at(order, i))) j += 1;
    const avgRank = (i + j) / 2;
    for (let k = i; k <= j; k += 1) ranks[at(order, k)] = avgRank;
    i = j + 1;
  }
  return ranks.map((r) => (r / (n - 1)) * 100);
}

/**
 * Substitutes `null` entries (no data for that candidate, e.g. no nflverse schedule match) with the
 * mean of the known values before percentile ranking, so a missing signal lands near the middle of
 * the pack rather than at either extreme. When every value is null, substitutes 0 for every
 * candidate: per {@link percentiles}' tied-rank averaging, an all-equal array of `n > 1` values
 * percentile-ranks every entry at 50 (the midpoint of the one tied cluster spanning the whole
 * array), not 100 - 100 only occurs in the degenerate `n === 1` case (a single candidate is
 * trivially the best, and only, one of itself). Either way this is a documented, inert fallback for
 * the all-missing-data edge case: it contributes a flat, non-discriminating value to every
 * candidate's Waiver Score for that component.
 */
// Exported for testing only (T4.5b-FIX M3): no other module should import this directly, it is an
// internal helper of `computeWaivers`.
export function substituteNulls(values: readonly (number | null)[]): number[] {
  const known = values.filter((v): v is number => v !== null);
  const fallback = known.length > 0 ? mean(known) : 0;
  return values.map((v) => v ?? fallback);
}

// ---------------------------------------------------------------------------
// Private row reads (house pattern: small, duplicated per data-function file; see `lineup.ts`)
// ---------------------------------------------------------------------------

interface WaiverLeagueRow {
  season: number;
  rosterPositions: string[];
  waiverMode: "rolling" | "faab" | "reverse_standings" | "unknown";
  waiverDayOfWeek: number | null;
  waiverClearDays: number | null;
  dailyWaivers: boolean;
}

function readLeague(h: DbHandle, leagueId: string): WaiverLeagueRow | null {
  const row = h.sqlite
    .prepare(
      `SELECT season, roster_positions_json AS rosterPositionsJson, waiver_mode AS waiverMode,
              waiver_day_of_week AS waiverDayOfWeek, waiver_clear_days AS waiverClearDays,
              daily_waivers AS dailyWaivers
       FROM leagues WHERE league_id = ?`,
    )
    .get(leagueId) as
    | {
        season: number;
        rosterPositionsJson: string;
        waiverMode: string;
        waiverDayOfWeek: number | null;
        waiverClearDays: number | null;
        dailyWaivers: number;
      }
    | undefined;
  if (row === undefined) return null;
  const modeParsed = WaiverModeSchema.safeParse(row.waiverMode);
  return {
    season: row.season,
    rosterPositions: parseList(row.rosterPositionsJson),
    waiverMode: modeParsed.success ? modeParsed.data : "unknown",
    waiverDayOfWeek: row.waiverDayOfWeek,
    waiverClearDays: row.waiverClearDays,
    dailyWaivers: row.dailyWaivers !== 0,
  };
}

interface WaiverRosterRow {
  rosterId: number;
  ownerId: string | null;
  playersJson: string;
  reserveJson: string;
  taxiJson: string;
  waiverPosition: number | null;
  displayName: string | null;
  teamName: string | null;
}

function readRosters(h: DbHandle, leagueId: string): WaiverRosterRow[] {
  return h.sqlite
    .prepare(
      `SELECT r.roster_id AS rosterId, r.owner_id AS ownerId, r.players_json AS playersJson,
              r.reserve_json AS reserveJson, r.taxi_json AS taxiJson,
              r.waiver_position AS waiverPosition,
              u.display_name AS displayName, u.team_name AS teamName
       FROM rosters r
       LEFT JOIN league_users u ON u.league_id = r.league_id AND u.user_id = r.owner_id
       WHERE r.league_id = ?`,
    )
    .all(leagueId) as WaiverRosterRow[];
}

function nonBlank(v: string | null): string | null {
  return v !== null && v.trim() !== "" ? v : null;
}

function teamNameOf(r: WaiverRosterRow): string {
  return nonBlank(r.teamName) ?? nonBlank(r.displayName) ?? `Team ${String(r.rosterId)}`;
}

interface PointsCell {
  actual: number | null;
  proj: number | null;
}

/** Every league-scored points row for a league/season, grouped by player then week. Unlike
 * `lineup.ts`'s id-scoped `readProjections`/`readHistory`, this reads the whole table once: the
 * waiver candidate pool can span hundreds of players, so one unfiltered scan is cheaper than a
 * chunked `IN (...)` query per caller. */
function readLeaguePoints(
  h: DbHandle,
  leagueId: string,
  season: number,
): Map<string, Map<number, PointsCell>> {
  const rows = h.sqlite
    .prepare(
      `SELECT player_id AS playerId, week, actual_pts AS actualPts, proj_pts AS projPts
       FROM league_player_week_points WHERE league_id = ? AND season = ?`,
    )
    .all(leagueId, season) as {
    playerId: string;
    week: number;
    actualPts: number | null;
    projPts: number | null;
  }[];
  const out = new Map<string, Map<number, PointsCell>>();
  for (const r of rows) {
    const byWeek = out.get(r.playerId) ?? new Map<number, PointsCell>();
    byWeek.set(r.week, { actual: r.actualPts, proj: r.projPts });
    out.set(r.playerId, byWeek);
  }
  return out;
}

/** This player's played weeks strictly before `beforeWeek` with a non-null actual score. */
function historyEntries(
  byWeek: Map<number, PointsCell> | undefined,
  beforeWeek: number,
): { week: number; actualPts: number }[] {
  if (byWeek === undefined) return [];
  const out: { week: number; actualPts: number }[] = [];
  for (const [week, cell] of byWeek) {
    if (week < beforeWeek && cell.actual !== null) out.push({ week, actualPts: cell.actual });
  }
  return out;
}

interface ScheduleEntry {
  opponent: string;
}

/** This week's schedule, keyed by nflverse team code. Mirrors `lineup.ts`'s own private helper,
 * trimmed to the one field (`opponent`) this module needs. */
function readWeekSchedule(h: DbHandle, season: number, week: number): Map<string, ScheduleEntry> {
  const rows = h.sqlite
    .prepare(`SELECT home, away FROM schedule WHERE season = ? AND week = ?`)
    .all(season, week) as { home: string; away: string }[];
  const out = new Map<string, ScheduleEntry>();
  for (const r of rows) {
    out.set(r.home, { opponent: r.away });
    out.set(r.away, { opponent: r.home });
  }
  return out;
}

interface DvpEntry {
  team: string;
  ptsAllowedPg: number;
}

/** Defense-vs-position at the latest `through_week` at or before `week`, sorted descending by
 * points allowed (rank 1 = easiest matchup). Mirrors `lineup.ts`'s own private helper exactly. */
function readDefenseVsPosition(
  h: DbHandle,
  leagueId: string,
  season: number,
  week: number,
): Map<string, DvpEntry[]> {
  const through = h.sqlite
    .prepare(
      `SELECT MAX(through_week) AS tw FROM defense_vs_position
       WHERE league_id = ? AND season = ? AND through_week <= ?`,
    )
    .get(leagueId, season, week) as { tw: number | null } | undefined;
  const out = new Map<string, DvpEntry[]>();
  if (through === undefined || through.tw === null) return out;
  const rows = h.sqlite
    .prepare(
      `SELECT team, position, pts_allowed_pg AS ptsAllowedPg FROM defense_vs_position
       WHERE league_id = ? AND season = ? AND through_week = ?`,
    )
    .all(leagueId, season, through.tw) as {
    team: string;
    position: string;
    ptsAllowedPg: number;
  }[];
  for (const r of rows) {
    const arr = out.get(r.position) ?? [];
    arr.push({ team: r.team, ptsAllowedPg: r.ptsAllowedPg });
    out.set(r.position, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => b.ptsAllowedPg - a.ptsAllowedPg);
  return out;
}

/**
 * WAIVER-3's schedule-strength proxy: the average opponent defense-vs-position rank (1 = easiest
 * matchup, per `readDefenseVsPosition`/`matchupGrade`'s convention) a candidate faces over `weeks`,
 * negated so a higher result means an easier (more favorable) schedule - the same "higher is
 * better" direction every other Waiver Score component uses before percentile ranking. Weeks with
 * no schedule entry (bye) or no DvP data for the position are skipped; `null` when none of `weeks`
 * has usable data (handled by {@link substituteNulls} before percentile ranking).
 */
function scheduleStrength(
  player: { team: string | null; position: string | null },
  weeks: readonly number[],
  scheduleByWeek: ReadonlyMap<number, Map<string, ScheduleEntry>>,
  dvpByWeek: ReadonlyMap<number, Map<string, DvpEntry[]>>,
): number | null {
  if (player.team === null || player.position === null) return null;
  const team = toNflverseTeam(player.team);
  let total = 0;
  let count = 0;
  for (const week of weeks) {
    const opponent = scheduleByWeek.get(week)?.get(team)?.opponent;
    if (opponent === undefined) continue;
    const dvpEntries = dvpByWeek.get(week)?.get(player.position);
    if (dvpEntries === undefined || dvpEntries.length === 0) continue;
    const idx = dvpEntries.findIndex((e) => e.team === opponent);
    if (idx === -1) continue;
    total += idx + 1;
    count += 1;
  }
  if (count === 0) return null;
  return -(total / count);
}

/** Usage rows for every week strictly before `beforeWeek`, grouped by player. One `readUsageWeek`
 * call per week (mirrors `lineup.ts`'s per-week `readDefenseVsPosition` loop pattern); empty when
 * `beforeWeek <= 1` or the table has no rows, both handled gracefully by `computeUsageTrend`. */
function readUsageHistory(
  h: DbHandle,
  season: number,
  beforeWeek: number,
): Map<
  string,
  {
    season: number;
    week: number;
    playerId: string;
    team: string | null;
    snapPct: number | null;
    targets: number | null;
    targetShare: number | null;
    airYardsShare: number | null;
    carries: number | null;
    carryShare: number | null;
    rzTouches: number | null;
  }[]
> {
  const out = new Map<
    string,
    {
      season: number;
      week: number;
      playerId: string;
      team: string | null;
      snapPct: number | null;
      targets: number | null;
      targetShare: number | null;
      airYardsShare: number | null;
      carries: number | null;
      carryShare: number | null;
      rzTouches: number | null;
    }[]
  >();
  for (let week = 1; week < beforeWeek; week += 1) {
    for (const row of readUsageWeek(h, season, week)) {
      const arr = out.get(row.playerId) ?? [];
      arr.push(row);
      out.set(row.playerId, arr);
    }
  }
  return out;
}

/** Every player's 24h trending entries (TREND-5), grouped by player id. */
function readTrendingByPlayer(h: DbHandle): Map<
  string,
  {
    playerId: string;
    type: "add" | "drop";
    count: number;
    lookbackHours: number;
    fetchedAt: string;
  }[]
> {
  const rows = readTrending(h, { lookbackHours: 24 });
  const out = new Map<
    string,
    {
      playerId: string;
      type: "add" | "drop";
      count: number;
      lookbackHours: number;
      fetchedAt: string;
    }[]
  >();
  for (const r of rows) {
    const arr = out.get(r.playerId) ?? [];
    arr.push(r);
    out.set(r.playerId, arr);
  }
  return out;
}

/** This season's failed waiver claims (ADR-002 item 7, WAIVER-6b): one record per added player on
 * a failed `"waiver"` transaction, position looked up from the full player directory. */
function readFailedWaiverClaims(
  h: DbHandle,
  leagueId: string,
  playersById: ReadonlyMap<string, FullPlayerRow>,
): FailedClaimRecord[] {
  const rows = h.sqlite
    .prepare(
      `SELECT week, adds_json AS addsJson FROM transactions
       WHERE league_id = ? AND type = 'waiver' AND status = 'failed'`,
    )
    .all(leagueId) as { week: number; addsJson: string | null }[];
  const out: FailedClaimRecord[] = [];
  for (const row of rows) {
    if (row.addsJson === null) continue;
    let adds: unknown;
    try {
      adds = JSON.parse(row.addsJson);
    } catch {
      continue;
    }
    const parsed = z.record(z.string(), z.number()).safeParse(adds);
    if (!parsed.success) continue;
    for (const [playerId, rosterId] of Object.entries(parsed.data)) {
      const position = playersById.get(playerId)?.position ?? null;
      if (position === null) continue;
      out.push({ teamId: String(rosterId), position, week: row.week });
    }
  }
  return out;
}

/** Steph live-testing fix: `computeLineupImpact` (a pure `@sideline/core` function with no access
 * to player names) emits `SUGGESTED_DROP`'s `value` as a raw Sleeper player id. Rewrite just that
 * one reason code's value to the dropped player's display name before it reaches the DTO/UI, which
 * renders `Reason.value` as-is (`reason-format.ts`). Falls back to the raw id if the player can't
 * be resolved (shouldn't happen in practice). Every other reason code/value passes through
 * unchanged. */
function resolveSuggestedDropReasons(
  reasons: readonly Reason[],
  playersById: ReadonlyMap<string, FullPlayerRow>,
): Reason[] {
  return reasons.map((r) => {
    if (r.code !== "SUGGESTED_DROP" || typeof r.value !== "string") return r;
    const name = playersById.get(r.value)?.fullName;
    return name === undefined ? r : { ...r, value: name };
  });
}

function toPlayer(row: FullPlayerRow): Player {
  return {
    playerId: row.playerId,
    fullName: row.fullName,
    firstName: null,
    lastName: null,
    position: row.position,
    fantasyPositions: row.fantasyPositions,
    team: row.team,
    status: row.status,
    injuryStatus: row.injuryStatus,
    injuryBodyPart: null,
    active: null,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
  };
}

/**
 * Builds one roster's player pool for `computeLineupImpact`/`computeCompetingClaims`. Taxi and
 * actual reserve/IR players both get a zeroed `weeklyValues`/ROS projection (`cannotPlay`, matching
 * `computeLineupImpact`'s "caller pre-zeros unavailable players" convention): neither can take the
 * field this week. But the two are **not** the same for auto-drop-suggestion eligibility (M1 fix,
 * T4.5b-FIX): `isIR` (the flag `pickLowestRosValue` filters on, in `lineup-impact.ts`) is set from
 * reserve membership ONLY. WAIVER-2's spec text is "the lowest-ROS-value non-IR player" - taxi is
 * not IR, and a taxi player is typically a roster's actual lowest-value stash, exactly the player a
 * user would want the auto-suggestion to offer to drop for a waiver claim. Leaving taxi players
 * eligible doesn't force them to always be picked: their zeroed `rosInput` still naturally drives
 * their ROS value to (near) zero, so they'll usually still be the pick when that's the right call,
 * but a true reserve/IR player stays permanently excluded as before. A future UI drop override
 * (`dropPlayerId`) lets a user explicitly choose any roster player to drop; this task does not need
 * it.
 */
function buildRosterPlayers(
  row: WaiverRosterRow,
  playersById: ReadonlyMap<string, FullPlayerRow>,
  points: ReadonlyMap<string, Map<number, PointsCell>>,
  week: number,
  seasonWeeks: number,
  lineupImpactWeeks: readonly number[],
): LineupImpactRosterPlayer[] {
  const ids = parseList(row.playersJson).filter((id) => id !== "0");
  const reserve = new Set(parseList(row.reserveJson));
  const taxi = new Set(parseList(row.taxiJson));
  const out: LineupImpactRosterPlayer[] = [];
  for (const id of ids) {
    const p = playersById.get(id);
    const fantasyPositions = p?.fantasyPositions ?? [];
    const isIR = reserve.has(id);
    const cannotPlay = isIR || taxi.has(id);
    const byWeek = points.get(id);
    const weeklyValues: Record<number, number> = {};
    for (const w of lineupImpactWeeks)
      weeklyValues[w] = cannotPlay ? 0 : (byWeek?.get(w)?.proj ?? 0);
    const rosWeeks: RestOfSeasonWeek[] = [];
    for (let w = week; w <= seasonWeeks; w += 1) {
      rosWeeks.push({
        week: w,
        projectedPoints: cannotPlay ? null : (byWeek?.get(w)?.proj ?? null),
      });
    }
    const history = historyEntries(byWeek, week);
    const seasonPpg = history.length > 0 ? mean(history.map((e) => e.actualPts)) : null;
    out.push({
      playerId: id,
      fantasyPositions,
      isIR,
      weeklyValues,
      rosInput: { weeks: rosWeeks, seasonPpg },
    });
  }
  return out;
}

function inputsHashFor(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    trending: lastSuccessAt(h, "trending"),
    nflverse: lastSuccessAt(h, "nflverse"),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Cached computation shape (validated with the public DTO schemas on read - see module doc)
// ---------------------------------------------------------------------------

const CachedWaiverComputationSchema = z.strictObject({
  candidates: z.array(WaiverCandidateSchema),
  priorityAdvisor: WaiverPriorityAdvisorSchema,
  candidatePoolSize: z.number().int(),
  poolReasons: z.array(ReasonSchema),
  freshness: FreshnessSchema,
});
interface CachedWaiverComputation {
  candidates: WaiverCandidate[];
  priorityAdvisor: WaiverPriorityAdvisor;
  candidatePoolSize: number;
  poolReasons: Reason[];
  freshness: Freshness;
}

interface RawCandidate {
  player: Player;
  lineupImpact: number;
  lineupImpactReasons: Reason[];
  droppedPlayerId: string | null;
  rosValue: number;
  rosReasons: Reason[];
  usageTrendRaw: number | null;
  trendSignal: TrendSignal;
  momentumRaw: number;
  momentumLabel: MomentumLabel;
  scheduleRaw: number | null;
  weeklyValues: Record<number, number>;
}

function computeWaivers(
  h: DbHandle,
  leagueId: string,
  league: WaiverLeagueRow,
  myRosterId: number,
  week: number,
  now: Date,
): Lookup<CachedWaiverComputation> {
  const rosterRows = readRosters(h, leagueId);
  const myRosterRow = rosterRows.find((r) => r.rosterId === myRosterId);
  if (myRosterRow === undefined) return { ok: false, reason: "not_found" };

  const seasonWeeks = DEFAULT_SEASON_WEEKS;
  const lineupImpactWeeks = Array.from(
    { length: DEFAULT_LINEUP_IMPACT_WEEK_COUNT },
    (_, i) => week + i,
  ).filter((w) => w <= seasonWeeks);

  const { slots } = resolveSlots(league.rosterPositions);
  const eligiblePositions = new Set(slots.flatMap((s) => s.eligiblePositions));

  const rosteredIds = readRosteredPlayerIds(h, leagueId);
  const allPlayers = readPlayers(h);
  const allPlayersById = new Map(allPlayers.map((p) => [p.playerId, p] as const));
  const pool = buildCandidatePool({
    players: allPlayers.map(toPlayer),
    rosteredPlayerIds: rosteredIds,
    eligiblePositions,
  });

  const rosteredPlayersById = new Map(
    readPlayers(h, [...rosteredIds]).map((p) => [p.playerId, p] as const),
  );
  const points = readLeaguePoints(h, leagueId, league.season);

  // Prefilter composite (WAIVER-2): cheap, over the full pool, before any Lineup Impact solve.
  const poolBase = new Map<
    string,
    {
      rosValue: number;
      rosReasons: Reason[];
      recentAvgPoints: number;
      seasonPpg: number | null;
      l3Delta: number | null;
    }
  >();
  for (const c of pool.candidates) {
    const byWeek = points.get(c.playerId);
    const history = historyEntries(byWeek, week);
    const scoring = computeScoringTrend({ weeklyPoints: history });
    const rosWeeks: RestOfSeasonWeek[] = [];
    for (let w = week; w <= seasonWeeks; w += 1) {
      rosWeeks.push({ week: w, projectedPoints: byWeek?.get(w)?.proj ?? null });
    }
    const ros = restOfSeasonProjection({ weeks: rosWeeks, seasonPpg: scoring.seasonPpg });
    poolBase.set(c.playerId, {
      rosValue: ros.points,
      rosReasons: ros.reasons,
      recentAvgPoints: scoring.l3Ppg ?? 0,
      seasonPpg: scoring.seasonPpg,
      l3Delta: scoring.l3Delta,
    });
  }

  const prefiltered = prefilterCandidates(
    pool.candidates.map((c) => {
      const base = mustGet(poolBase, c.playerId);
      return {
        playerId: c.playerId,
        rosValue: base.rosValue,
        recentAvgPoints: base.recentAvgPoints,
      };
    }),
    PREFILTER_POOL_SIZE,
  );
  const prefilteredIds = new Set(prefiltered.candidates.map((c) => c.playerId));
  const trimmedPlayers = pool.candidates.filter((c) => prefilteredIds.has(c.playerId));

  const myRosterPlayers = buildRosterPlayers(
    myRosterRow,
    rosteredPlayersById,
    points,
    week,
    seasonWeeks,
    lineupImpactWeeks,
  );

  const usageByPlayer = readUsageHistory(h, league.season, week);
  const trendingByPlayer = readTrendingByPlayer(h);
  const scheduleByWeek = new Map(
    lineupImpactWeeks.map((w) => [w, readWeekSchedule(h, league.season, w)] as const),
  );
  const dvpByWeek = new Map(
    lineupImpactWeeks.map(
      (w) => [w, readDefenseVsPosition(h, leagueId, league.season, w)] as const,
    ),
  );

  const raw: RawCandidate[] = trimmedPlayers.map((player) => {
    const base = mustGet(poolBase, player.playerId);
    const byWeek = points.get(player.playerId);
    const weeklyValues: Record<number, number> = {};
    for (const w of lineupImpactWeeks) weeklyValues[w] = byWeek?.get(w)?.proj ?? 0;

    const lineupImpactResult = computeLineupImpact({
      rosterPositions: league.rosterPositions,
      roster: myRosterPlayers,
      candidate: {
        playerId: player.playerId,
        fantasyPositions: player.fantasyPositions,
        weeklyValues,
      },
      weeks: lineupImpactWeeks,
    });

    const usageWeeks = usageByPlayer.get(player.playerId) ?? [];
    const usageResult =
      player.position !== null
        ? computeUsageTrend({ position: player.position, weeks: usageWeeks })
        : { fields: [], reasons: [] };
    const usageDeltas = usageResult.fields
      .map((f) => f.delta)
      .filter((d): d is number => d !== null);
    const usageDelta = usageDeltas.length > 0 ? mean(usageDeltas) : null;
    // Fallback (T4.5b, documented): when no nflverse usage delta is available (K/DEF, or no
    // nflverse data yet), the recent-scoring-trend delta stands in as the usage-trend percentile
    // input, since both measure "is this player trending up or down lately" - just via a different
    // signal. See `computeTrendSignal`'s own identical points-only fallback for TREND-4's display.
    const usageTrendRaw = usageDelta ?? base.l3Delta;

    const trendSignalResult = computeTrendSignal({
      l3Delta: base.l3Delta ?? 0,
      usageDelta,
      seasonPpg: base.seasonPpg ?? 0,
    });

    const momentumEntries = trendingByPlayer.get(player.playerId) ?? [];
    const momentumResult = computeTrendingMomentum({ entries: momentumEntries });

    const scheduleRaw = scheduleStrength(player, lineupImpactWeeks, scheduleByWeek, dvpByWeek);

    return {
      player,
      lineupImpact: lineupImpactResult.impact,
      lineupImpactReasons: lineupImpactResult.reasons,
      droppedPlayerId: lineupImpactResult.droppedPlayerId,
      rosValue: base.rosValue,
      rosReasons: base.rosReasons,
      usageTrendRaw,
      trendSignal: trendSignalResult.signal,
      momentumRaw: momentumResult.netCount,
      momentumLabel: momentumResult.label,
      scheduleRaw,
      weeklyValues,
    };
  });

  const lineupImpactPct = percentiles(raw.map((r) => r.lineupImpact));
  const rosValuePct = percentiles(raw.map((r) => r.rosValue));
  const usageTrendPct = percentiles(substituteNulls(raw.map((r) => r.usageTrendRaw)));
  const momentumPct = percentiles(raw.map((r) => r.momentumRaw));
  const schedulePct = percentiles(substituteNulls(raw.map((r) => r.scheduleRaw)));

  const candidates: WaiverCandidate[] = raw.map((r, i) => {
    const scoreResult = computeWaiverScore({
      lineupImpactPercentile: at(lineupImpactPct, i),
      rosValuePercentile: at(rosValuePct, i),
      usageTrendPercentile: at(usageTrendPct, i),
      momentumPercentile: at(momentumPct, i),
      schedulePercentile: at(schedulePct, i),
    });
    return {
      playerId: r.player.playerId,
      name: r.player.fullName,
      position: r.player.position,
      fantasyPositions: [...r.player.fantasyPositions],
      nflTeam: r.player.team,
      status: r.player.status,
      injuryStatus: r.player.injuryStatus,
      lineupImpact: r.lineupImpact,
      rosValue: r.rosValue,
      waiverScore: scoreResult.score,
      trendSignal: r.trendSignal,
      momentumLabel: r.momentumLabel,
      suggestedDropPlayerId: r.droppedPlayerId,
      reasons: resolveSuggestedDropReasons(
        [...scoreResult.reasons, ...r.lineupImpactReasons, ...r.rosReasons],
        allPlayersById,
      ),
    };
  });

  const priorityAdvisor = computePriorityAdvisor(h, leagueId, league, rosterRows, myRosterId, {
    candidates,
    raw,
    rosteredPlayersById,
    allPlayersById,
    points,
    week,
    seasonWeeks,
    lineupImpactWeeks,
    now,
  });

  const freshness = computeFreshness(
    lastSuccessAt(h, "rosters"),
    SYNC_CADENCE_MS.rosters,
    now.getTime(),
  );

  return {
    ok: true,
    data: {
      candidates,
      priorityAdvisor,
      candidatePoolSize: pool.candidates.length,
      poolReasons: [...pool.reasons, ...prefiltered.reasons],
      freshness,
    },
  };
}

interface PriorityAdvisorContext {
  candidates: WaiverCandidate[];
  raw: RawCandidate[];
  rosteredPlayersById: ReadonlyMap<string, FullPlayerRow>;
  allPlayersById: ReadonlyMap<string, FullPlayerRow>;
  points: ReadonlyMap<string, Map<number, PointsCell>>;
  week: number;
  seasonWeeks: number;
  lineupImpactWeeks: readonly number[];
  now: Date;
}

/** WAIVER-6a..6d: the rolling-priority waiver advisor. See the module doc and `priority-advisor.ts`
 * for the formulas; this function only wires real league data into them. */
function computePriorityAdvisor(
  h: DbHandle,
  leagueId: string,
  league: WaiverLeagueRow,
  rosterRows: readonly WaiverRosterRow[],
  myRosterId: number,
  ctx: PriorityAdvisorContext,
): WaiverPriorityAdvisor {
  const {
    candidates,
    raw,
    rosteredPlayersById,
    allPlayersById,
    points,
    week,
    seasonWeeks,
    lineupImpactWeeks,
    now,
  } = ctx;

  const rosterById = new Map(rosterRows.map((r) => [r.rosterId, r] as const));
  const rawWaiverPositionById = new Map(
    rosterRows.map((r) => [r.rosterId, r.waiverPosition] as const),
  );

  const orderInput = rosterRows.map((r) => ({
    teamId: String(r.rosterId),
    waiverPosition: r.waiverPosition ?? UNSET_WAIVER_POSITION,
  }));
  const orderResult = computeWaiverOrder({ rosters: orderInput, myTeamId: String(myRosterId) });

  const order = orderResult.order.map((e) => {
    const rosterId = Number(e.teamId);
    const r = mustGet(rosterById, rosterId);
    return {
      rosterId,
      teamName: teamNameOf(r),
      waiverPosition: rawWaiverPositionById.get(rosterId) ?? null,
      rank: e.rank,
      isMine: rosterId === myRosterId,
    };
  });

  const nextClear = computeNextWaiverClear({
    now,
    waiverDayOfWeek: league.waiverDayOfWeek,
    dailyWaivers: league.dailyWaivers,
  });

  const reasons: Reason[] = [...orderResult.reasons, ...nextClear.reasons];

  const applicable = league.waiverMode !== "faab" && orderResult.myRank !== null;
  if (league.waiverMode === "faab") {
    reasons.push({
      code: "FAAB_NOT_SUPPORTED",
      label: "This league uses FAAB waivers; per-claim priority advice isn't available yet",
    });
  }

  const priorityCandidates: WaiverPriorityAdvisor["candidates"] = [];
  const myRank = orderResult.myRank;
  if (applicable && myRank !== null) {
    const myWaiverPosition = rawWaiverPositionById.get(myRosterId) ?? UNSET_WAIVER_POSITION;
    const teamsAhead = order.filter((e) => e.rank < myRank && !e.isMine);

    const rosterPlayersByTeam = new Map(
      teamsAhead.map((e) => [
        e.rosterId,
        buildRosterPlayers(
          mustGet(rosterById, e.rosterId),
          rosteredPlayersById,
          points,
          week,
          seasonWeeks,
          lineupImpactWeeks,
        ),
      ]),
    );
    const myRosterRow = mustGet(rosterById, myRosterId);
    const myRosterPlayers = buildRosterPlayers(
      myRosterRow,
      rosteredPlayersById,
      points,
      week,
      seasonWeeks,
      lineupImpactWeeks,
    );

    const failedClaimHistory = readFailedWaiverClaims(h, leagueId, allPlayersById);
    const weeksRemaining = Math.max(1, seasonWeeks - week + 1);

    const topCandidates = [...candidates]
      .sort((a, b) => b.waiverScore - a.waiverScore)
      .slice(0, WAIVER_PRIORITY_CANDIDATE_CAP);

    for (const c of topCandidates) {
      const rawEntry = raw.find((r) => r.player.playerId === c.playerId);
      if (rawEntry === undefined) continue;
      const candidateInput: LineupImpactCandidate = {
        playerId: c.playerId,
        fantasyPositions: rawEntry.player.fantasyPositions,
        weeklyValues: rawEntry.weeklyValues,
      };

      const teamsInput: CompetingTeamRosterInput[] = teamsAhead.map((e) => ({
        teamId: String(e.rosterId),
        waiverPosition: rawWaiverPositionById.get(e.rosterId) ?? UNSET_WAIVER_POSITION,
        rosterPositions: league.rosterPositions,
        roster: mustGet(rosterPlayersByTeam, e.rosterId),
      }));

      const competingResult = computeCompetingClaims({
        candidate: candidateInput,
        weeks: lineupImpactWeeks,
        myWaiverPosition,
        teams: teamsInput,
        failedClaimHistory,
      });

      const claimAdviceResult = computeClaimAdvice({
        lineupImpactInput: {
          rosterPositions: league.rosterPositions,
          roster: myRosterPlayers,
          candidate: candidateInput,
          weeks: lineupImpactWeeks,
        },
        myWaiverPosition,
        weeksRemaining,
      });

      priorityCandidates.push({
        playerId: c.playerId,
        competingTeams: competingResult.teams.map((t) => {
          const rosterId = Number(t.teamId);
          return {
            rosterId,
            teamName: teamNameOf(mustGet(rosterById, rosterId)),
            waiverPosition: rawWaiverPositionById.get(rosterId) ?? null,
            aheadOfMe: t.aheadOfMe,
            lineupImpact: t.lineupImpact.impact,
            likelyCompeting: t.likelyCompeting,
            reasons: resolveSuggestedDropReasons(t.reasons, allPlayersById),
          };
        }),
        claimAdvice: {
          worthIt: claimAdviceResult.worthIt,
          lineupImpact: claimAdviceResult.lineupImpact.impact,
          valueOfPriority: claimAdviceResult.valueOfPriority,
          positionFactor: claimAdviceResult.positionFactor,
          weeksFactor: claimAdviceResult.weeksFactor,
          reasons: resolveSuggestedDropReasons(claimAdviceResult.reasons, allPlayersById),
        },
      });
    }
  }

  return {
    applicable,
    waiverMode: league.waiverMode,
    myWaiverPosition: orderResult.myWaiverPosition,
    myRank: orderResult.myRank,
    order,
    nextClearAt: nextClear.nextClearAt.toISOString(),
    waiverClearDays: league.waiverClearDays,
    competingNeedThreshold: DEFAULT_COMPETING_NEED_THRESHOLD,
    candidates: priorityCandidates,
    reasons,
  };
}

export interface WaiverGetRequest {
  week?: number;
  rosterId?: number;
  positions?: string[];
}

/**
 * WAIVER-1..WAIVER-6d: the full waivers response for one roster. See the module doc for the
 * algorithm and caching strategy. `now` is injected for the priority advisor's clock-dependent
 * fields (WAIVER-6d) and test determinism, matching `getLineup`'s convention.
 */
export function getWaivers(
  h: DbHandle,
  leagueId: string,
  request: WaiverGetRequest,
  now: Date,
): Lookup<WaiverResponse> {
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

  const kind = `waivers:${String(rosterId)}`;
  const inputsHash = inputsHashFor(h);

  let computation: CachedWaiverComputation | null = null;
  const cached = getComputed(h, { leagueId, week, kind, inputsHash });
  if (cached !== null) {
    const parsed = CachedWaiverComputationSchema.safeParse(cached);
    if (parsed.success) computation = parsed.data;
    // Fall through to a fresh computation if a cached payload somehow fails validation.
  }

  if (computation === null) {
    const built = computeWaivers(h, leagueId, league, rosterId, week, now);
    if (!built.ok) return built;
    computation = built.data;
    putComputed(h, { leagueId, week, kind, inputsHash }, computation, now);
  }

  const forMyTeam = sortForMyTeam(computation.candidates, request.positions);
  const bestAvailable = sortBestAvailable(computation.candidates, request.positions);

  const response = WaiverResponseSchema.parse({
    leagueId,
    rosterId,
    week,
    candidatePoolSize: computation.candidatePoolSize,
    poolReasons: computation.poolReasons,
    forMyTeam,
    bestAvailable,
    priorityAdvisor: computation.priorityAdvisor,
    freshness: computation.freshness,
  });
  return { ok: true, data: response };
}
