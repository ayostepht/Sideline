/**
 * T5.4c (PLAN 5.8): wires five already-built `packages/core/src/league/` modules (LEAGUE-1, -2,
 * -3, -4, -6) plus playoff odds (LEAGUE-5, `packages/core/src/league/playoff-odds.ts`, T5.3) into
 * one whole-league response. No analytics logic lives here: every scoring/normalization/simulation
 * decision is delegated to `@sideline/core`; this module only loads real league data, shapes it
 * into those functions' input types, and maps the output to the `LeagueIntelligenceResponse` DTO.
 *
 * ## "Played" week cutoff
 * This codebase has no live scoring feed (T5.4b). A week is "played" when it is strictly less
 * than the current NFL state week (`readNflState(h)?.week`, defaulting to 1, clamped to
 * `1..DEFAULT_SEASON_WEEKS` - mirrors `roster-strength.ts`'s own `currentWeek` derivation exactly,
 * so both modules agree on "how many weeks remain"). This matches this codebase's existing
 * "read weeks from the current week through `playoff_week_start - 1`" convention (ADR-002 item 5).
 * All-play (LEAGUE-1), luck (LEAGUE-2), the
 * recent-points-for and weekly-standard-deviation inputs below, and the playoff odds "remaining
 * schedule" window are all built from this one cutoff.
 *
 * ## Power score inputs (LEAGUE-3)
 * - `allPlayWinRate`: the season all-play win rate, NOT normalized (per `power-score.ts`'s own
 *   doc comment: it is already a natural [0, 1] rate).
 * - `recentPointsForNormalized`: each team's MEAN points-for over its last up to 3 played weeks
 *   (fewer if the season has not reached 3 played weeks yet), run through `minMaxNormalize` across
 *   every team in the league. The mean (not the sum) is used so a sync gap or a team missing a
 *   stored week does not unfairly shrink its total relative to a team with a full 3 weeks of data.
 * - `rosterStrengthNormalized`: each team's `rosOptimalTotal` from `getRosterStrength` (T5.4d), run
 *   through `minMaxNormalize` across every team.
 *
 * ## Playoff odds inputs (LEAGUE-5)
 * - `wins`/`ties`/`pointsFor`: current standings (`getStandings`, `league-views.ts`).
 * - `meanWeeklyScore`: `rosOptimalTotal / weeksRemaining`, where `weeksRemaining =
 *   max(1, DEFAULT_SEASON_WEEKS - currentWeek + 1)` - the number of weeks (including the current,
 *   not-yet-complete one) `rosOptimalTotal` was itself computed over.
 * - `sd`: the population standard deviation of this team's own played-week point totals (a plain
 *   caller-side statistic, not `@sideline/core`'s player-level `weeklyStandardDeviation`, which
 *   shrinks toward a position CV that has no team-level equivalent); 0 with fewer than 1 played
 *   week.
 * - `schedule`: remaining `matchups` pairings strictly after the played cutoff, further bounded to
 *   weeks at or before `playoffWeekStart - 1` per ADR-002 item 5 ("weeks at or before
 *   `playoff_week_start - 1`" are real pairings; at/after are bracket placeholders, not real
 *   regular-season games) - falls back to `DEFAULT_SEASON_WEEKS` when `playoffWeekStart` is
 *   unknown. A schedule entry referencing a roster id outside the current standings (a data
 *   anomaly - e.g. a roster removed mid-season) is dropped rather than thrown, mirroring
 *   `readLeagueScheduleMatchups`'s own "skip anomalies" convention.
 * - `firstRoundByeCount: 0` (always): no Sleeper-settings mapping for playoff byes exists anywhere
 *   in this codebase yet (T5.3's own module doc flags this as a known gap). This is a documented
 *   limitation, not a bug - every team's `byePct` is `null` as a result (see LEAGUE-5's own doc).
 * - `playoffOdds` is `null` for every team when the league's `playoffTeams` setting is unknown
 *   (not yet synced) or out of `simulatePlayoffOdds`'s required `[0, numTeams]` range: rather than
 *   invent a league-settings mapping (explicitly out of scope per the brief), this view simply
 *   omits LEAGUE-5 for that league until the real setting is available.
 *
 * ## Caching
 * Whole-league, one entry (`kind = "league-intelligence"`, `week = 0` sentinel), same house
 * pattern as `roster-strength.ts`. The inputs hash additionally covers `transactions` and
 * `matchups` beyond `roster-strength.ts`'s own set, since manager tendencies (LEAGUE-6) and the
 * all-play/playoff-odds inputs above also depend on those sync jobs.
 */
import { createHash } from "node:crypto";
import {
  computeAllPlaySeason,
  computeLuck,
  computeManagerTendencies,
  computePositionalHeatmap,
  computePowerScore,
  DEFAULT_SEASON_WEEKS,
  minMaxNormalize,
  simulatePlayoffOdds,
  type AllPlayWeekInput,
  type ManagerTransactionInput,
  type PlayoffOddsMatchup,
  type PlayoffOddsTeamInput,
  type SimulatePlayoffOddsInput,
  type PositionalStrengthEntry,
} from "@sideline/core";
import {
  getComputed,
  lastSuccessAt,
  putComputed,
  readLeaguePlayoffTeams,
  readLeaguePlayoffWeekStart,
  readLeagueScheduleMatchups,
  readLeagueTransactions,
  readLeagueWeeklyScores,
  readNflState,
  type DbHandle,
} from "@sideline/db";
import {
  computeFreshness,
  LeagueIntelligenceResponseSchema,
  SYNC_CADENCE_MS,
  WaiverModeSchema,
  type LeagueIntelligenceResponse,
  type Reason,
} from "@sideline/shared";
import { getRosterStrength } from "./roster-strength.js";
import { getStandings } from "./league-views.js";

export type Lookup<T> = { ok: true; data: T } | { ok: false; reason: "not_found" };

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation (divides by `n`, not `n - 1`), matching `@sideline/core`'s own
 * `weeklyStandardDeviation` convention. 0 for fewer than 1 sample. */
function populationStandardDeviation(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / n);
}

/** Asserts `arr[index]` is defined; every call site here indexes within a loop bound derived from
 * the same array's own length, so the thrown branch is unreachable in practice (mirrors the
 * identical helper in `waivers.ts`/`packages/core`). */
function at<T>(arr: readonly T[], index: number): T {
  const v = arr[index];
  if (v === undefined) throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  return v;
}

interface LeagueIntelligenceLeagueRow {
  waiverMode: "rolling" | "faab" | "reverse_standings" | "unknown";
  waiverBudget: number | null;
}

function readLeague(h: DbHandle, leagueId: string): LeagueIntelligenceLeagueRow | null {
  const row = h.sqlite
    .prepare(
      `SELECT waiver_mode AS waiverMode, waiver_budget AS waiverBudget
       FROM leagues WHERE league_id = ?`,
    )
    .get(leagueId) as { waiverMode: string; waiverBudget: number | null } | undefined;
  if (row === undefined) return null;
  const modeParsed = WaiverModeSchema.safeParse(row.waiverMode);
  return {
    waiverMode: modeParsed.success ? modeParsed.data : "unknown",
    waiverBudget: row.waiverBudget,
  };
}

/** Each roster's FAAB budget already used this season (`rosters.waiver_budget_used`); not exposed
 * by `getStandings`. */
function readFaabBudgetUsed(h: DbHandle, leagueId: string): Map<number, number> {
  const rows = h.sqlite
    .prepare(
      `SELECT roster_id AS rosterId, waiver_budget_used AS used FROM rosters WHERE league_id = ?`,
    )
    .all(leagueId) as { rosterId: number; used: number }[];
  return new Map(rows.map((r) => [r.rosterId, r.used] as const));
}

/**
 * A small, fast, non-cryptographic string hash (FNV-1a, 32-bit) deriving `simulatePlayoffOdds`'s
 * required numeric seed from the league id (CLAUDE.md section 8: RNG seeds are always passed in by
 * the caller). Mirrors `matchup.ts`'s `deriveSeed` exactly.
 */
function deriveSeed(leagueId: string): number {
  const payload = `${leagueId}:playoff-odds`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Per-roster population sd of played-week point totals (0 with no played weeks). */
function sdByRosterFrom(
  rows: readonly { rosterId: number }[],
  pointsByRosterWeek: ReadonlyMap<number, ReadonlyMap<number, number>>,
): Map<number, number> {
  return new Map<number, number>(
    rows.map((row) => {
      const weeksForRoster = pointsByRosterWeek.get(row.rosterId);
      const values = weeksForRoster === undefined ? [] : [...weeksForRoster.values()];
      return [row.rosterId, populationStandardDeviation(values)] as const;
    }),
  );
}

export interface PlayoffOddsContext {
  rows: readonly { rosterId: number; wins: number; ties: number; pointsFor: number }[];
  strengthByRoster: ReadonlyMap<number, { rosOptimalTotal: number }>;
  sdByRoster: ReadonlyMap<number, number>;
  currentWeek: number;
}

export interface PlayoffOddsBuild {
  input: SimulatePlayoffOddsInput;
  /** Weeks `rosOptimalTotal` spans; `meanWeeklyScore = rosOptimalTotal / weeksRemaining`. */
  weeksRemaining: number;
}

/**
 * Builds `simulatePlayoffOdds` input (LEAGUE-5; see the module doc). Caller must have checked
 * `playoffTeams` is known and within `[0, numTeams]`. Exported so trades can rerun the same
 * simulation (same seed) with some teams' `meanWeeklyScore` replaced.
 */
export function buildPlayoffOddsInput(
  h: DbHandle,
  leagueId: string,
  ctx: PlayoffOddsContext,
): PlayoffOddsBuild {
  const playoffTeams = readLeaguePlayoffTeams(h, leagueId) ?? 0;
  const playoffWeekStart = readLeaguePlayoffWeekStart(h, leagueId);
  const regularSeasonEnd = playoffWeekStart !== null ? playoffWeekStart - 1 : DEFAULT_SEASON_WEEKS;
  const rosterIds = new Set(ctx.rows.map((row) => row.rosterId));
  const weeksRemaining = Math.max(1, DEFAULT_SEASON_WEEKS - ctx.currentWeek + 1);

  const schedule: PlayoffOddsMatchup[] = readLeagueScheduleMatchups(h, leagueId, {
    afterWeek: ctx.currentWeek - 1,
  })
    .filter((m) => m.week <= regularSeasonEnd)
    // Defensive: a data anomaly (e.g. a roster id no longer in standings) is dropped rather than
    // thrown, mirroring `readLeagueScheduleMatchups`'s own "skip anomalies" convention.
    .filter((m) => rosterIds.has(m.rosterIdA) && rosterIds.has(m.rosterIdB))
    .map((m) => ({ week: m.week, rosterIdA: m.rosterIdA, rosterIdB: m.rosterIdB }));

  const teams: PlayoffOddsTeamInput[] = ctx.rows.map((row) => ({
    rosterId: row.rosterId,
    wins: row.wins,
    ties: row.ties,
    pointsFor: row.pointsFor,
    meanWeeklyScore:
      (ctx.strengthByRoster.get(row.rosterId)?.rosOptimalTotal ?? 0) / weeksRemaining,
    sd: ctx.sdByRoster.get(row.rosterId) ?? 0,
  }));

  return {
    input: {
      teams,
      schedule,
      playoffTeams,
      firstRoundByeCount: 0,
      seed: deriveSeed(leagueId),
    },
    weeksRemaining,
  };
}

/**
 * Standalone loader for callers outside `getLeagueIntelligence` (trades): standings, roster
 * strength and played-week sd, then {@link buildPlayoffOddsInput}. `null` when the league's
 * `playoffTeams` setting is unknown or out of range (same rule as league-intelligence).
 */
export function loadPlayoffOddsBuild(
  h: DbHandle,
  leagueId: string,
  now: Date,
): PlayoffOddsBuild | null {
  const standings = getStandings(h, leagueId, now);
  if (!standings.ok) return null;
  const rows = standings.data.rows;
  const strength = getRosterStrength(h, leagueId, now);
  if (!strength.ok) return null;
  const playoffTeams = readLeaguePlayoffTeams(h, leagueId);
  if (playoffTeams === null || playoffTeams < 0 || playoffTeams > rows.length) return null;
  const currentWeek = Math.min(Math.max(readNflState(h)?.week ?? 1, 1), DEFAULT_SEASON_WEEKS);
  const pointsByRosterWeek = new Map<number, Map<number, number>>();
  for (const r of readLeagueWeeklyScores(h, leagueId)) {
    if (r.week >= currentWeek) continue;
    const m = pointsByRosterWeek.get(r.rosterId) ?? new Map<number, number>();
    m.set(r.week, r.points);
    pointsByRosterWeek.set(r.rosterId, m);
  }
  return buildPlayoffOddsInput(h, leagueId, {
    rows,
    strengthByRoster: new Map(strength.data.map((r) => [r.rosterId, r] as const)),
    sdByRoster: sdByRosterFrom(rows, pointsByRosterWeek),
    currentWeek,
  });
}

function inputsHashFor(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    state: lastSuccessAt(h, "state"),
    transactions: lastSuccessAt(h, "transactions"),
    matchups: lastSuccessAt(h, "matchups"),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * LEAGUE-1..LEAGUE-6: the full league-intelligence response for one league. See the module doc for
 * the played-week cutoff, power score's recent-points-for window, the playoff odds inputs and
 * `firstRoundByeCount: 0` limitation, and the caching key. `now` is injected for freshness and test
 * determinism, matching `getRosterStrength`/`getMatchup`'s convention.
 */
export function getLeagueIntelligence(
  h: DbHandle,
  leagueId: string,
  now: Date,
): Lookup<LeagueIntelligenceResponse> {
  const league = readLeague(h, leagueId);
  if (league === null) return { ok: false, reason: "not_found" };

  const kind = "league-intelligence";
  const week = 0; // Sentinel: whole-league, not scoped to one week.
  const inputsHash = inputsHashFor(h);
  const cached = getComputed(h, { leagueId, week, kind, inputsHash });
  if (cached !== null) {
    const parsed = LeagueIntelligenceResponseSchema.safeParse(cached);
    if (parsed.success) return { ok: true, data: parsed.data };
    // Fall through to a fresh computation if a cached payload somehow fails validation.
  }

  const standings = getStandings(h, leagueId, now);
  if (!standings.ok) return { ok: false, reason: "not_found" };
  const rows = standings.data.rows;

  const rosterStrength = getRosterStrength(h, leagueId, now);
  if (!rosterStrength.ok) return { ok: false, reason: "not_found" };
  const strengthByRoster = new Map(rosterStrength.data.map((r) => [r.rosterId, r] as const));

  const rawWeek = readNflState(h)?.week ?? 1;
  const currentWeek = Math.min(Math.max(rawWeek, 1), DEFAULT_SEASON_WEEKS);

  // ---- All-play (LEAGUE-1) / luck (LEAGUE-2) / recent points-for / weekly sd, from played weeks ----
  const playedScores = readLeagueWeeklyScores(h, leagueId).filter((r) => r.week < currentWeek);
  const weeksMap = new Map<number, { rosterId: number; points: number }[]>();
  const pointsByRosterWeek = new Map<number, Map<number, number>>();
  for (const r of playedScores) {
    const weekArr = weeksMap.get(r.week) ?? [];
    weekArr.push({ rosterId: r.rosterId, points: r.points });
    weeksMap.set(r.week, weekArr);
    const rosterMap = pointsByRosterWeek.get(r.rosterId) ?? new Map<number, number>();
    rosterMap.set(r.week, r.points);
    pointsByRosterWeek.set(r.rosterId, rosterMap);
  }
  const allPlayWeeks: AllPlayWeekInput[] = [...weeksMap.entries()].map(([weekNum, scores]) => ({
    week: weekNum,
    scores,
  }));
  const allPlayByRoster = new Map(
    computeAllPlaySeason(allPlayWeeks).map((r) => [r.rosterId, r] as const),
  );

  const recentPointsForRaw = rows.map((row) => {
    const weeksForRoster = pointsByRosterWeek.get(row.rosterId);
    if (weeksForRoster === undefined) return 0;
    const lastWeeks = [...weeksForRoster.keys()].sort((a, b) => b - a).slice(0, 3);
    return mean(lastWeeks.map((w) => weeksForRoster.get(w) ?? 0));
  });
  const recentPointsForNormalized = minMaxNormalize(recentPointsForRaw);

  const rosterStrengthRaw = rows.map(
    (row) => strengthByRoster.get(row.rosterId)?.rosOptimalTotal ?? 0,
  );
  const rosterStrengthNormalized = minMaxNormalize(rosterStrengthRaw);

  const sdByRoster = sdByRosterFrom(rows, pointsByRosterWeek);

  // ---- Playoff odds (LEAGUE-5) ----
  const playoffTeamsSetting = readLeaguePlayoffTeams(h, leagueId);
  const numTeams = rows.length;
  let playoffOddsByRoster: Map<
    number,
    { playoffPct: number; byePct: number | null; seedDistribution: Map<number, number> }
  > | null = null;
  // Season-level signal from `simulatePlayoffOdds` (e.g. the zero-remaining-games case), identical
  // for every team in a given call -- not per-team. See `LeagueIntelligencePlayoffOddsSchema`'s doc.
  let playoffOddsReasons: Reason[] = [];
  if (playoffTeamsSetting !== null && playoffTeamsSetting >= 0 && playoffTeamsSetting <= numTeams) {
    const built = buildPlayoffOddsInput(h, leagueId, {
      rows,
      strengthByRoster,
      sdByRoster,
      currentWeek,
    });
    const sim = simulatePlayoffOdds(built.input);
    playoffOddsByRoster = new Map(sim.teams.map((t) => [t.rosterId, t] as const));
    playoffOddsReasons = sim.reasons;
  }

  // ---- Manager tendencies (LEAGUE-6) ----
  const isFaab = league.waiverMode === "faab";
  const faabBudgetUsedByRoster = readFaabBudgetUsed(h, leagueId);
  const transactionsInput: ManagerTransactionInput[] = readLeagueTransactions(h, leagueId).map(
    (t) => ({
      type: t.type,
      status: t.status,
      adds: t.adds,
      rosterIds: t.rosterIds,
      waiverBid: t.waiverBid,
    }),
  );

  // ---- Positional heatmap (LEAGUE-4), flattened across every team and position ----
  const heatmapEntries: PositionalStrengthEntry[] = rosterStrength.data.flatMap((r) =>
    r.byPosition.map((p) => ({ rosterId: r.rosterId, position: p.position, value: p.value })),
  );
  const positionalHeatmap = computePositionalHeatmap(heatmapEntries);

  const teams = rows.map((row, i) => {
    const allPlay =
      allPlayByRoster.get(row.rosterId) ??
      ({
        rosterId: row.rosterId,
        wins: 0,
        losses: 0,
        ties: 0,
        gamesPlayed: 0,
        winRate: 0,
        weeklyWinRates: [] as readonly number[],
        reasons: [
          {
            code: "LEAGUE_ALL_PLAY_NO_GAMES",
            label: "No all-play games recorded this season",
            value: 0,
          },
        ],
      } as const);

    const luckResult = computeLuck(row.wins, allPlay.weeklyWinRates);
    const powerResult = computePowerScore({
      allPlayWinRate: allPlay.winRate,
      recentPointsForNormalized: at(recentPointsForNormalized, i),
      rosterStrengthNormalized: at(rosterStrengthNormalized, i),
    });
    const playoffOddsRaw = playoffOddsByRoster?.get(row.rosterId) ?? null;
    const managerTendenciesResult = computeManagerTendencies({
      rosterId: row.rosterId,
      transactions: transactionsInput,
      isFaab,
      faabBudgetTotal: isFaab ? league.waiverBudget : null,
      faabBudgetUsed: isFaab ? (faabBudgetUsedByRoster.get(row.rosterId) ?? null) : null,
    });

    return {
      rosterId: row.rosterId,
      teamName: row.teamName,
      allPlay: {
        wins: allPlay.wins,
        losses: allPlay.losses,
        ties: allPlay.ties,
        gamesPlayed: allPlay.gamesPlayed,
        winRate: allPlay.winRate,
        weeklyWinRates: [...allPlay.weeklyWinRates],
        reasons: allPlay.reasons,
      },
      luck: {
        actualWins: luckResult.actualWins,
        expectedWins: luckResult.expectedWins,
        luck: luckResult.luck,
        reasons: luckResult.reasons,
      },
      powerScore: {
        score: powerResult.powerScore,
        allPlayWinRate: allPlay.winRate,
        recentPointsForNormalized: at(recentPointsForNormalized, i),
        rosterStrengthNormalized: at(rosterStrengthNormalized, i),
        reasons: powerResult.reasons,
      },
      playoffOdds:
        playoffOddsRaw === null
          ? null
          : {
              playoffPct: playoffOddsRaw.playoffPct,
              byePct: playoffOddsRaw.byePct,
              seedDistribution: [...playoffOddsRaw.seedDistribution.entries()]
                .map(([seed, probability]) => ({ seed, probability }))
                .sort((a, b) => a.seed - b.seed),
              reasons: playoffOddsReasons,
            },
      managerTendencies: managerTendenciesResult,
    };
  });

  const response: LeagueIntelligenceResponse = LeagueIntelligenceResponseSchema.parse({
    leagueId,
    teams,
    positionalHeatmap,
    playoffTeams: playoffTeamsSetting,
    firstRoundByeCount: 0,
    freshness: computeFreshness(
      lastSuccessAt(h, "rosters"),
      SYNC_CADENCE_MS.rosters,
      now.getTime(),
    ),
  });

  putComputed(h, { leagueId, week, kind, inputsHash }, response, now);
  return { ok: true, data: response };
}
