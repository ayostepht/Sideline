/**
 * P7b.7 (PLAN 5.9, ADR-022): trade evaluate and trade finder data functions. All trade math lives
 * in `@sideline/core` (`evaluateTrade`, `findTrades`); playoff odds rerun core's
 * `simulatePlayoffOdds` through league-intelligence's own input builder, with the two teams'
 * `meanWeeklyScore` shifted by `rosLineupDelta / weeksRemaining`. Before and after use the same
 * seed (common random numbers), and the "before" run is the exact input league-intelligence uses,
 * so "before" matches its playoff percent.
 *
 * Playoff fields are null (with a reason) when the league's playoff setting is unknown or no
 * regular-season games remain.
 */
import { createHash } from "node:crypto";
import {
  computePositionalHeatmap,
  evaluateTrade,
  findTrades,
  simulatePlayoffOdds,
  type EvaluateTradeResult,
  type FoundTrade,
  type PlayoffOddsTeamInput,
  type TradeSideResult,
  type TradeTeam,
} from "@sideline/core";
import {
  getComputed,
  getSleeperUserId,
  lastSuccessAt,
  putComputed,
  readPlayers,
  type DbHandle,
} from "@sideline/db";
import {
  computeFreshness,
  SYNC_CADENCE_MS,
  TRADE_FINDER_PLAYOFF_TOP_N,
  TradeEvaluateRequestSchema,
  TradeEvaluateResponseSchema,
  TradeFinderResponseSchema,
  TradeSuggestionSchema,
  type Reason,
  type TradeEvaluateResponse,
  type TradeFinderResponse,
  type TradePlayerRef,
  type TradeSuggestion,
  type TradeTeamImpact,
} from "@sideline/shared";
import { z } from "zod";
import { loadPlayoffOddsBuild, type PlayoffOddsBuild } from "./league-intelligence.js";
import { getRosterStrength, getTradeTeams } from "./roster-strength.js";

export type TradeLookup<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_found" | "no_team" }
  | { ok: false; reason: "invalid"; code: string; message: string };

function invalid(
  code: string,
  message: string,
): { ok: false; reason: "invalid"; code: string; message: string } {
  return { ok: false, reason: "invalid", code, message };
}

function resolveMyRosterId(h: DbHandle, leagueId: string): number | null {
  const userId = getSleeperUserId(h);
  if (userId === null) return null;
  const mine = h.sqlite
    .prepare(
      "SELECT roster_id AS id FROM rosters WHERE league_id = ? AND owner_id = ? ORDER BY roster_id LIMIT 1",
    )
    .get(leagueId, userId) as { id: number } | undefined;
  return mine?.id ?? null;
}

function refsFor(h: DbHandle, ids: readonly string[]): Map<string, TradePlayerRef> {
  return new Map(
    readPlayers(h, [...new Set(ids)]).map(
      (p) =>
        [
          p.playerId,
          { playerId: p.playerId, name: p.fullName, position: p.position, nflTeam: p.team },
        ] as const,
    ),
  );
}

function ref(refs: ReadonlyMap<string, TradePlayerRef>, id: string): TradePlayerRef {
  return refs.get(id) ?? { playerId: id, name: id, position: null, nflTeam: null };
}

// ---- Playoff odds ----

interface PlayoffContext {
  build: PlayoffOddsBuild;
  /** rosterId -> playoffPct for the untouched league. */
  before: Map<number, number>;
}

const NO_PLAYOFF_REASON: Reason = {
  code: "TRADE_PLAYOFF_UNAVAILABLE",
  label: "Playoff odds are not available (no regular-season games left or playoff setup unknown)",
};

function playoffContext(h: DbHandle, leagueId: string, now: Date): PlayoffContext | null {
  const build = loadPlayoffOddsBuild(h, leagueId, now);
  if (build === null || build.input.schedule.length === 0) return null;
  const sim = simulatePlayoffOdds(build.input);
  return { build, before: new Map(sim.teams.map((t) => [t.rosterId, t.playoffPct] as const)) };
}

/** Playoff pct per roster after shifting the given teams' mean weekly score. */
function playoffAfter(
  ctx: PlayoffContext,
  shifts: ReadonlyMap<number, number>,
): Map<number, number> {
  const teams: PlayoffOddsTeamInput[] = ctx.build.input.teams.map((t) => ({
    ...t,
    meanWeeklyScore: t.meanWeeklyScore + (shifts.get(t.rosterId) ?? 0) / ctx.build.weeksRemaining,
  }));
  const sim = simulatePlayoffOdds({ ...ctx.build.input, teams });
  return new Map(sim.teams.map((t) => [t.rosterId, t.playoffPct] as const));
}

function impact(
  side: TradeSideResult,
  refs: ReadonlyMap<string, TradePlayerRef>,
  playoff: { before: number; after: number } | null,
): TradeTeamImpact {
  const reasons: Reason[] = [...side.reasons];
  if (playoff === null) reasons.push(NO_PLAYOFF_REASON);
  else {
    reasons.push({
      code: "TRADE_PLAYOFF_DELTA",
      label: "Change in playoff chance",
      value: playoff.after - playoff.before,
      impact: playoff.after - playoff.before,
    });
  }
  return {
    rosterId: side.rosterId,
    rosLineupBefore: side.rosLineupBefore,
    rosLineupAfter: side.rosLineupAfter,
    rosLineupDelta: side.rosLineupDelta,
    playoffPctBefore: playoff?.before ?? null,
    playoffPctAfter: playoff?.after ?? null,
    playoffPctDelta: playoff === null ? null : playoff.after - playoff.before,
    dropped: side.dropped.map((id) => ref(refs, id)),
    reasons,
  };
}

function playoffFor(
  ctx: PlayoffContext | null,
  trade: { mine: TradeSideResult; theirs: TradeSideResult },
): {
  mine: { before: number; after: number } | null;
  theirs: { before: number; after: number } | null;
} {
  if (ctx === null) return { mine: null, theirs: null };
  const after = playoffAfter(
    ctx,
    new Map([
      [trade.mine.rosterId, trade.mine.rosLineupDelta],
      [trade.theirs.rosterId, trade.theirs.rosLineupDelta],
    ]),
  );
  const pair = (id: number) => {
    const b = ctx.before.get(id);
    const a = after.get(id);
    return b === undefined || a === undefined ? null : { before: b, after: a };
  };
  return { mine: pair(trade.mine.rosterId), theirs: pair(trade.theirs.rosterId) };
}

function freshnessFor(h: DbHandle, now: Date) {
  return computeFreshness(lastSuccessAt(h, "rosters"), SYNC_CADENCE_MS.rosters, now.getTime());
}

function teamById(teams: readonly TradeTeam[], id: number): TradeTeam | undefined {
  return teams.find((t) => t.rosterId === id);
}

// ---- Evaluate ----

/** TRADE-1/TRADE-3/TRADE-4: evaluate one proposal between my roster and `otherRosterId`. */
export function evaluateTradeForLeague(
  h: DbHandle,
  leagueId: string,
  req: unknown,
  now: Date,
): TradeLookup<TradeEvaluateResponse> {
  const parsed = TradeEvaluateRequestSchema.safeParse(req);
  const trade = getTradeTeams(h, leagueId, now);
  if (!trade.ok) return { ok: false, reason: "not_found" };
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((i) => i.path.map(String).join(".") || "body")),
    ];
    return invalid("invalid_request", `Invalid request: ${fields.join(", ")}.`);
  }
  const { otherRosterId, give, get } = parsed.data;

  const myRosterId = resolveMyRosterId(h, leagueId);
  if (myRosterId === null) return { ok: false, reason: "no_team" };
  if (otherRosterId === myRosterId) {
    return invalid("invalid_trade", "Pick another team to trade with.");
  }
  const mine = teamById(trade.data.teams, myRosterId);
  const theirs = teamById(trade.data.teams, otherRosterId);
  if (mine === undefined) return { ok: false, reason: "no_team" };
  if (theirs === undefined) return invalid("invalid_trade", "That team is not in this league.");

  const result: EvaluateTradeResult = evaluateTrade({
    rosterPositions: trade.data.rosterPositions,
    mine,
    theirs,
    give,
    get,
  });
  if (!result.ok) return invalid("invalid_trade", result.message);

  const refs = refsFor(h, [
    ...result.give,
    ...result.get,
    ...result.mine.dropped,
    ...result.theirs.dropped,
  ]);
  const po = playoffFor(playoffContext(h, leagueId, now), result);
  const response = TradeEvaluateResponseSchema.parse({
    give: result.give.map((id) => ref(refs, id)),
    get: result.get.map((id) => ref(refs, id)),
    mine: impact(result.mine, refs, po.mine),
    theirs: impact(result.theirs, refs, po.theirs),
    fairness: result.fairness,
    reasons: result.reasons,
    freshness: freshnessFor(h, now),
  });
  return { ok: true, data: response };
}

// ---- Finder ----

const CachedFinderSchema = z.strictObject({
  suggestions: z.array(TradeSuggestionSchema),
  evaluatedCount: z.number().int().min(0),
});

function finderHash(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    state: lastSuccessAt(h, "state"),
    matchups: lastSuccessAt(h, "matchups"),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function toSuggestion(
  t: FoundTrade,
  refs: ReadonlyMap<string, TradePlayerRef>,
  po: ReturnType<typeof playoffFor>,
): TradeSuggestion {
  return {
    otherRosterId: t.otherRosterId,
    give: t.give.map((id) => ref(refs, id)),
    get: t.get.map((id) => ref(refs, id)),
    mine: impact(t.mine, refs, po.mine),
    theirs: impact(t.theirs, refs, po.theirs),
    fairness: t.fairness,
    reasons: t.reasons,
  };
}

/** TRADE-2: suggested both-improving trades for my team. Playoff deltas only for the top N. */
export function findTradesForLeague(
  h: DbHandle,
  leagueId: string,
  now: Date,
): TradeLookup<TradeFinderResponse> {
  const trade = getTradeTeams(h, leagueId, now);
  if (!trade.ok) return { ok: false, reason: "not_found" };
  const myRosterId = resolveMyRosterId(h, leagueId);
  if (myRosterId === null) return { ok: false, reason: "no_team" };
  const me = teamById(trade.data.teams, myRosterId);
  if (me === undefined) return { ok: false, reason: "no_team" };

  const kind = `trade-finder:${String(myRosterId)}`;
  const inputsHash = finderHash(h);
  const cached = getComputed(h, { leagueId, week: 0, kind, inputsHash });
  if (cached !== null) {
    const parsed = CachedFinderSchema.safeParse(cached);
    if (parsed.success) {
      return {
        ok: true,
        data: TradeFinderResponseSchema.parse({ ...parsed.data, freshness: freshnessFor(h, now) }),
      };
    }
  }

  const strength = getRosterStrength(h, leagueId, now);
  if (!strength.ok) return { ok: false, reason: "not_found" };
  const heatmap = computePositionalHeatmap(
    strength.data.flatMap((r) =>
      r.byPosition.map((p) => ({ rosterId: r.rosterId, position: p.position, value: p.value })),
    ),
  );
  const found = findTrades({
    rosterPositions: trade.data.rosterPositions,
    me,
    others: trade.data.teams.filter((t) => t.rosterId !== myRosterId),
    heatmap,
  });

  const refs = refsFor(
    h,
    found.suggestions.flatMap((t) => [...t.give, ...t.get, ...t.mine.dropped, ...t.theirs.dropped]),
  );
  const ctx = found.suggestions.length > 0 ? playoffContext(h, leagueId, now) : null;
  const suggestions = found.suggestions.map((t, i) =>
    toSuggestion(
      t,
      refs,
      i < TRADE_FINDER_PLAYOFF_TOP_N ? playoffFor(ctx, t) : { mine: null, theirs: null },
    ),
  );
  const payload = CachedFinderSchema.parse({ suggestions, evaluatedCount: found.evaluatedCount });
  putComputed(h, { leagueId, week: 0, kind, inputsHash }, payload, now);
  return {
    ok: true,
    data: TradeFinderResponseSchema.parse({ ...payload, freshness: freshnessFor(h, now) }),
  };
}
