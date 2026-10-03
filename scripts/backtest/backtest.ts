/**
 * MATCH-3 (PLAN 5.3): backtest harness that decides whether the MATCH-2 matchup multiplier
 * (`alpha`/`beta`) should ship, or stay off (both 0, matchup grades shown as context only).
 *
 * Method, walk-forward (no look-ahead): for each eligible week `w`, every team-position's
 * defense-vs-position prior ({@link computeDefenseVsPosition}, MATCH-1) is built using only
 * `player_week_stats` from weeks strictly before `w` of the *same* season. For every player-week
 * that has both a real projection row and a real stats row in week `w`:
 *
 *   raw      = rescoreProjection(projection row).points
 *   adjusted = raw * matchupMultiplier({ dvpOppPos, avgPos, alpha, beta }).multiplier
 *   actual   = scoreStatLine(stats row)
 *
 * MAE and within-position Spearman rank correlation (grouped by season/week/position, averaged
 * across groups with at least 2 players) are computed for every `(alpha, beta)` in a 5x5 grid
 * (`ALPHA_BETA_GRID` x `ALPHA_BETA_GRID`, 25 points: a coarse first pass; PLAN 5.3 only requires
 * a grid search over `[0, 1]`, a finer search near a promising edge is a documented follow-up,
 * see the module README). The decision ships the best-found pair only if its MAE beats the raw
 * baseline (alpha = 0, beta = 0) by at least {@link MIN_MAE_IMPROVEMENT_PCT}; otherwise the
 * decision is `"raw_only"` and `DEFAULT_MATCHUP_ADJUSTMENT_CONFIG` stays `{ alpha: 0, beta: 0 }`.
 *
 * Eligibility (`w >= MIN_BACKTEST_WEEK`): applied per season independently, not cumulatively
 * across the full set of requested weeks. PLAN 5.3 says "over the 2025 season ... plus completed
 * 2026 weeks, for each completed week w >= 4". Early weeks of *any* season lack enough prior
 * weeks for a meaningful DvP prior (by week 4 there are 3 prior weeks, close to MATCH-1's own
 * shrinkage constant k = 4), so the walk-forward floor is applied within each season, not only to
 * the season currently in progress. A week with `season` appearing more than once across the
 * `weeks` option is only evaluated once.
 *
 * Known simplifications (all documented so the real gate-time run against live data is informed,
 * not surprised):
 * - `beta` (the optional implied-team-total term in `matchupMultiplier`) has no effect here: this
 *   harness never supplies `impliedTeamTotal`/`leagueAvgTotal`, because no implied-team-total data
 *   source (Vegas lines) exists anywhere in this codebase yet (PLAN 5.3 calls it optional, "when
 *   available"). The beta dimension of the grid is therefore a documented no-op placeholder; every
 *   beta value ties for a given alpha, and the decision is driven entirely by alpha. Wiring a real
 *   implied-team-total provider is a follow-up, not in this task's scope.
 * - A player's team/position come from the *current* snapshot of the `players` table
 *   (`readPlayersTeamPosition`), not a historical team-by-week table (none exists). A player who
 *   changed teams mid-season will have the wrong opponent for weeks before the move. Rare enough,
 *   and conservative (it adds noise against the adjusted projection, not in its favor).
 * - DvP priors reset at each season boundary (no carry-over from the end of a prior season into
 *   the next season's early weeks), consistent with the per-season eligibility floor above.
 */
import { SeasonTypeSchema, type SeasonType } from "../../packages/shared/src/index.js";
import {
  computeDefenseVsPosition,
  matchupMultiplier,
  rescoreProjection,
  scoreStatLine,
} from "../../packages/core/src/index.js";
import {
  readLeagues,
  readPlayerWeekProjections,
  readPlayerWeekStats,
  readPlayersTeamPosition,
  readSchedule,
  schema,
  type DbHandle,
} from "../../packages/db/src/index.js";

/** Walk-forward eligibility floor (PLAN 5.3): a week needs at least this many prior weeks of
 * stats in its own season for a meaningful DvP prior. Applied per season (see module doc). */
export const MIN_BACKTEST_WEEK = 4;

/** Coarse 5-point grid for both alpha and beta (PLAN 5.3 specifies searching [0, 1]). */
export const ALPHA_BETA_GRID: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** MATCH-3's ship bar: the best grid point must beat the raw baseline's MAE by at least this. */
export const MIN_MAE_IMPROVEMENT_PCT = 1;

export interface BacktestWeekSpec {
  season: number;
  seasonType: SeasonType;
  week: number;
}

export interface BacktestOptions {
  /** Candidate weeks to test. Deduplicated; filtered to `seasonType === "regular"` and the
   * per-season `MIN_BACKTEST_WEEK` floor before anything is computed. */
  weeks: readonly BacktestWeekSpec[];
}

export interface GridResult {
  alpha: number;
  beta: number;
  mae: number;
  /** Average within-position Spearman rank correlation across season/week/position groups with
   * at least 2 players (groups of 1 have no rank correlation and are excluded). 0 when there is
   * nothing to average (no qualifying player-weeks at all). */
  spearman: number;
}

export interface BacktestSummary {
  mae: number;
  spearman: number;
}

export interface BacktestReport {
  leagueId: string;
  weeksRequested: readonly BacktestWeekSpec[];
  /** `weeksRequested` after dedup and the regular-season / `MIN_BACKTEST_WEEK` filter. */
  weeksEligible: readonly BacktestWeekSpec[];
  /** Player-weeks that had both a projection row and a stats row, and a resolvable opponent. */
  playerWeeksTested: number;
  /** Every `(alpha, beta)` combination tried, `ALPHA_BETA_GRID.length ** 2` points. */
  grid: readonly GridResult[];
  /** The alpha = 0, beta = 0 point (raw projections, no adjustment). */
  baseline: BacktestSummary;
  /** The grid point with the lowest MAE (ties broken toward the lowest alpha, then lowest beta,
   * which is the iteration order below, so a plain running-minimum is correct). */
  best: GridResult;
  /** `(baseline.mae - best.mae) / baseline.mae * 100`. 0 when `baseline.mae` is 0 (nothing to
   * improve on, which also means `decision` is always `"raw_only"` in that case). */
  maeImprovementPct: number;
  decision: "ship" | "raw_only";
}

interface WeeklyPointsAllowedEntry {
  week: number;
  pointsAllowed: number;
}

/** One qualifying player-week, with everything the grid search needs precomputed (DvP/avgPos do
 * not depend on alpha/beta, so they are computed once per player-week, not once per grid point). */
interface Entry {
  season: number;
  week: number;
  position: string;
  raw: number;
  actual: number;
  dvpOppPos: number;
  avgPos: number;
}

function dedupWeeks(weeks: readonly BacktestWeekSpec[]): BacktestWeekSpec[] {
  const seen = new Set<string>();
  const out: BacktestWeekSpec[] = [];
  for (const w of weeks) {
    const key = `${w.season}|${w.seasonType}|${w.week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function addToBucket<K1, K2, V>(map: Map<K1, Map<K2, V[]>>, key1: K1, key2: K2, value: V): void {
  let inner = map.get(key1);
  if (inner === undefined) {
    inner = new Map();
    map.set(key1, inner);
  }
  let arr = inner.get(key2);
  if (arr === undefined) {
    arr = [];
    inner.set(key2, arr);
  }
  arr.push(value);
}

/** Builds a `season -> week -> playerId -> stats` index from flat rows. */
function indexByWeekAndPlayer(
  rows: readonly { week: number; playerId: string; stats: Record<string, number> }[],
): Map<number, Map<string, Record<string, number>>> {
  const out = new Map<number, Map<string, Record<string, number>>>();
  for (const r of rows) {
    let byPlayer = out.get(r.week);
    if (byPlayer === undefined) {
      byPlayer = new Map();
      out.set(r.week, byPlayer);
    }
    byPlayer.set(r.playerId, r.stats);
  }
  return out;
}

interface Game {
  home: string;
  away: string;
}

function indexScheduleByWeek(rows: readonly { week: number; home: string; away: string }[]) {
  const out = new Map<number, Game[]>();
  for (const r of rows) {
    let arr = out.get(r.week);
    if (arr === undefined) {
      arr = [];
      out.set(r.week, arr);
    }
    arr.push({ home: r.home, away: r.away });
  }
  return out;
}

interface PlayerInfo {
  team: string;
  position: string;
}

/**
 * Sleeper uses `LAR` where nflverse (the `schedule` table, see `readSchedule`) uses `LA`
 * (docs/sleeper-api-notes.md section 14e). Duplicated here rather than imported from
 * `apps/worker/src/jobs/team-code.ts` because that path is out of this task's scope (owned by a
 * different task); this is the only schedule-team-code join this harness needs. `pointsAllowed`
 * and `oppByTeam` below are keyed by the schedule's (nflverse) codes throughout, so this
 * conversion only has to happen once, at the point a player's own (Sleeper) team code is used to
 * look something up.
 */
function scheduleTeamCode(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}

/** Builds the DvP inputs (per-team-per-position weekly points allowed, plus the league position
 * average) from stats strictly before week `w`, within one season. */
function buildDvpContext(
  priorWeeks: readonly number[],
  statsByWeek: Map<number, Map<string, Record<string, number>>>,
  scheduleByWeek: Map<number, Game[]>,
  playersIndex: Map<string, PlayerInfo>,
  scoringSettings: Record<string, number>,
): {
  pointsAllowed: Map<string, Map<string, WeeklyPointsAllowedEntry[]>>;
  leaguePositionAverage: Map<string, number>;
} {
  const pointsAllowed = new Map<string, Map<string, WeeklyPointsAllowedEntry[]>>();
  const positionTotals = new Map<string, number[]>();

  for (const pw of priorWeeks) {
    const statsThisWeek = statsByWeek.get(pw);
    const games = scheduleByWeek.get(pw);
    if (statsThisWeek === undefined || games === undefined) continue;

    for (const { home, away } of games) {
      const homeTotals = new Map<string, number>();
      const awayTotals = new Map<string, number>();
      for (const [playerId, stats] of statsThisWeek) {
        const info = playersIndex.get(playerId);
        if (info === undefined) continue;
        const team = scheduleTeamCode(info.team);
        if (team !== home && team !== away) continue;
        const pts = scoreStatLine(stats, scoringSettings);
        const totals = team === home ? homeTotals : awayTotals;
        totals.set(info.position, (totals.get(info.position) ?? 0) + pts);
      }
      for (const [position, pts] of homeTotals) {
        addToBucket(pointsAllowed, away, position, { week: pw, pointsAllowed: pts });
        let arr = positionTotals.get(position);
        if (arr === undefined) {
          arr = [];
          positionTotals.set(position, arr);
        }
        arr.push(pts);
      }
      for (const [position, pts] of awayTotals) {
        addToBucket(pointsAllowed, home, position, { week: pw, pointsAllowed: pts });
        let arr = positionTotals.get(position);
        if (arr === undefined) {
          arr = [];
          positionTotals.set(position, arr);
        }
        arr.push(pts);
      }
    }
  }

  const leaguePositionAverage = new Map<string, number>();
  for (const [position, values] of positionTotals) {
    const sum = values.reduce((s, v) => s + v, 0);
    leaguePositionAverage.set(position, values.length === 0 ? 0 : sum / values.length);
  }

  return { pointsAllowed, leaguePositionAverage };
}

/** Collects every qualifying `Entry` for one league across the requested, eligible weeks. */
function collectEntries(
  h: DbHandle,
  leagueId: string,
  weeksEligible: readonly BacktestWeekSpec[],
): {
  entries: Entry[];
  scoringSettings: Record<string, number>;
} {
  const league = readLeagues(h).find((l) => l.leagueId === leagueId);
  if (league === undefined) {
    throw new Error(`no league "${leagueId}" in the leagues table; sync it first`);
  }
  const scoringSettings = league.scoringSettings;

  const playersIndex = new Map<string, PlayerInfo>();
  for (const p of readPlayersTeamPosition(h)) {
    if (p.team === null || p.position === null) continue;
    playersIndex.set(p.playerId, { team: p.team, position: p.position });
  }

  const entries: Entry[] = [];
  const seasons = [...new Set(weeksEligible.map((w) => w.season))];

  for (const season of seasons) {
    const statsByWeek = indexByWeekAndPlayer(readPlayerWeekStats(h, season, "regular"));
    const projByWeek = indexByWeekAndPlayer(readPlayerWeekProjections(h, season, "regular"));
    const scheduleByWeek = indexScheduleByWeek(readSchedule(h, season));

    for (const spec of weeksEligible.filter((w) => w.season === season)) {
      const w = spec.week;
      const priorWeeks: number[] = [];
      for (let pw = 1; pw < w; pw += 1) priorWeeks.push(pw);

      const { pointsAllowed, leaguePositionAverage } = buildDvpContext(
        priorWeeks,
        statsByWeek,
        scheduleByWeek,
        playersIndex,
        scoringSettings,
      );

      const oppByTeam = new Map<string, string>();
      for (const { home, away } of scheduleByWeek.get(w) ?? []) {
        oppByTeam.set(home, away);
        oppByTeam.set(away, home);
      }

      const statsW = statsByWeek.get(w);
      const projW = projByWeek.get(w);
      if (statsW === undefined || projW === undefined) continue;

      for (const [playerId, projStats] of projW) {
        const actualStats = statsW.get(playerId);
        if (actualStats === undefined) continue;
        const info = playersIndex.get(playerId);
        if (info === undefined) continue;
        const opp = oppByTeam.get(scheduleTeamCode(info.team));
        if (opp === undefined) continue;

        const avgPos = leaguePositionAverage.get(info.position) ?? 0;
        const dvpEntries = pointsAllowed.get(opp)?.get(info.position) ?? [];
        const dvp = computeDefenseVsPosition({
          weeklyPointsAllowed: dvpEntries,
          leaguePositionAverage: avgPos,
        }).ptsAllowedPg;

        const raw = rescoreProjection({ stats: projStats, scoringSettings }).points;
        const actual = scoreStatLine(actualStats, scoringSettings);

        entries.push({
          season,
          week: w,
          position: info.position,
          raw,
          actual,
          dvpOppPos: dvp,
          avgPos,
        });
      }
    }
  }

  return { entries, scoringSettings };
}

/** Average rank (1-indexed), ties averaged, via `noUncheckedIndexedAccess`-safe lookups. */
function rank(values: readonly number[]): number[] {
  const n = values.length;
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    const tieValue = order[i]?.value;
    let j = i;
    while (j + 1 < n && order[j + 1]?.value === tieValue) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) {
      const entry = order[k];
      if (entry !== undefined) ranks[entry.index] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation; null when either series has zero variance (undefined correlation). */
function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length;
  if (n === 0) return null;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    const ai = a[i];
    const bi = b[i];
    if (ai === undefined || bi === undefined) continue;
    const da = ai - meanA;
    const db = bi - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return null;
  return num / Math.sqrt(denA * denB);
}

function spearmanRho(xs: readonly number[], ys: readonly number[]): number | null {
  return pearson(rank(xs), rank(ys));
}

/** MAE and average within-group Spearman for one `(alpha, beta)` grid point. Pure; does not
 * mutate `entries`. Guards divide-by-zero for an empty `entries` (no qualifying player-weeks). */
function evaluate(entries: readonly Entry[], alpha: number, beta: number): BacktestSummary {
  if (entries.length === 0) return { mae: 0, spearman: 0 };

  let sumAbsErr = 0;
  const groups = new Map<string, { adjusted: number; actual: number }[]>();
  for (const e of entries) {
    const multiplier = matchupMultiplier({
      dvpOppPos: e.dvpOppPos,
      avgPos: e.avgPos,
      alpha,
      beta,
    }).multiplier;
    const adjusted = e.raw * multiplier;
    sumAbsErr += Math.abs(adjusted - e.actual);

    const key = `${e.season}|${e.week}|${e.position}`;
    let arr = groups.get(key);
    if (arr === undefined) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push({ adjusted, actual: e.actual });
  }
  const mae = sumAbsErr / entries.length;

  let spearmanSum = 0;
  let spearmanCount = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const rho = spearmanRho(
      arr.map((x) => x.adjusted),
      arr.map((x) => x.actual),
    );
    if (rho !== null) {
      spearmanSum += rho;
      spearmanCount += 1;
    }
  }
  const spearman = spearmanCount === 0 ? 0 : spearmanSum / spearmanCount;

  return { mae, spearman };
}

/**
 * Runs the MATCH-3 backtest against an already-synced, read-only database handle. Throws if the
 * league is not in the `leagues` table. See the module doc comment for the full method and its
 * documented simplifications.
 */
export function runBacktest(h: DbHandle, leagueId: string, opts: BacktestOptions): BacktestReport {
  const weeksRequested = dedupWeeks(opts.weeks);
  const weeksEligible = weeksRequested.filter(
    (w) => w.seasonType === "regular" && w.week >= MIN_BACKTEST_WEEK,
  );

  const { entries } = collectEntries(h, leagueId, weeksEligible);

  const grid: GridResult[] = [];
  for (const alpha of ALPHA_BETA_GRID) {
    for (const beta of ALPHA_BETA_GRID) {
      const { mae, spearman } = evaluate(entries, alpha, beta);
      grid.push({ alpha, beta, mae, spearman });
    }
  }

  const baselinePoint = grid.find((g) => g.alpha === 0 && g.beta === 0);
  const baseline: BacktestSummary =
    baselinePoint === undefined
      ? { mae: 0, spearman: 0 }
      : { mae: baselinePoint.mae, spearman: baselinePoint.spearman };

  // Running minimum over `grid`, which iterates alpha ascending then beta ascending, so the
  // first strictly-lower MAE found already implements the documented tie-break (lowest alpha,
  // then lowest beta).
  let best: GridResult = baselinePoint ?? {
    alpha: 0,
    beta: 0,
    mae: baseline.mae,
    spearman: baseline.spearman,
  };
  for (const g of grid) {
    if (g.mae < best.mae) best = g;
  }

  const maeImprovementPct =
    baseline.mae === 0 ? 0 : ((baseline.mae - best.mae) / baseline.mae) * 100;
  const decision: "ship" | "raw_only" =
    maeImprovementPct >= MIN_MAE_IMPROVEMENT_PCT ? "ship" : "raw_only";

  return {
    leagueId,
    weeksRequested,
    weeksEligible,
    playerWeeksTested: entries.length,
    grid,
    baseline,
    best,
    maeImprovementPct,
    decision,
  };
}

/**
 * Discovers candidate `(season, seasonType, week)` triples present in the database, i.e. weeks
 * with at least one `player_week_stats` row and at least one `player_week_projections` row (both
 * are required for any player-week to be testable; see the module doc). `runBacktest` applies the
 * regular-season / `MIN_BACKTEST_WEEK` filter on top of whatever this returns, so callers do not
 * need to pre-filter.
 */
export function discoverAvailableWeeks(h: DbHandle): BacktestWeekSpec[] {
  const statsRows = h.db
    .selectDistinct({
      season: schema.playerWeekStats.season,
      seasonType: schema.playerWeekStats.seasonType,
      week: schema.playerWeekStats.week,
    })
    .from(schema.playerWeekStats)
    .all();
  const projRows = h.db
    .selectDistinct({
      season: schema.playerWeekProjections.season,
      seasonType: schema.playerWeekProjections.seasonType,
      week: schema.playerWeekProjections.week,
    })
    .from(schema.playerWeekProjections)
    .all();

  const keyOf = (r: { season: number; seasonType: string; week: number }): string =>
    `${r.season}|${r.seasonType}|${r.week}`;
  const projKeys = new Set(projRows.map(keyOf));

  const out: BacktestWeekSpec[] = [];
  const seen = new Set<string>();
  for (const r of statsRows) {
    const key = keyOf(r);
    if (!projKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    const seasonType = SeasonTypeSchema.safeParse(r.seasonType);
    if (!seasonType.success) continue;
    out.push({ season: r.season, seasonType: seasonType.data, week: r.week });
  }
  return out.sort((a, b) => a.season - b.season || a.week - b.week);
}
