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

/** Core reason codes whose `value` is a player id and whose core label embeds that id. */
const PLAYER_REASON_CODES = new Set([
  "TRADE_ENTERS_LINEUP",
  "TRADE_LEAVES_LINEUP",
  "TRADE_AUTO_DROP",
]);

/** Player ids named by reasons, so their names can be loaded before relabeling. */
function reasonPlayerIds(reasons: readonly Reason[]): string[] {
  return reasons.flatMap((r) =>
    PLAYER_REASON_CODES.has(r.code) && typeof r.value === "string" ? [r.value] : [],
  );
}

/**
 * M1 (P7b.7f): rebuild labels that core writes with raw player ids, using the resolved player
 * names. `value` stays the player id. `own` is true for my side (and shared reasons).
 */
function relabel(
  reasons: readonly Reason[],
  refs: ReadonlyMap<string, TradePlayerRef>,
  own: boolean,
): Reason[] {
  const who = own ? "your" : "their";
  return reasons.map((r) => {
    if (!PLAYER_REASON_CODES.has(r.code) || typeof r.value !== "string") return r;
    const name = ref(refs, r.value).name;
    switch (r.code) {
      case "TRADE_ENTERS_LINEUP":
        return { ...r, label: `${name} joins ${who} best lineup` };
      case "TRADE_LEAVES_LINEUP":
        return { ...r, label: `${name} leaves ${who} best lineup` };
      default:
        return {
          ...r,
          label: own ? `Drops ${name} to make room` : `They drop ${name} to make room`,
        };
    }
  });
}

function sideReasonIds(...sides: readonly TradeSideResult[]): string[] {
  return sides.flatMap((s) => [...s.dropped, ...reasonPlayerIds(s.reasons)]);
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

/** M2: finder suggestions past the top N skip the playoff sim, which is not the same as unavailable. */
const PLAYOFF_NOT_COMPUTED_REASON: Reason = {
  code: "TRADE_PLAYOFF_NOT_COMPUTED",
  label: "Playoff odds shown for the top 10 only",
};

type PlayoffPair = { before: number; after: number };
/** `null` = truly unavailable; `"not_computed"` = skipped on purpose (finder beyond top N). */
type PlayoffState = PlayoffPair | null | "not_computed";

const BaselineSchema = z.array(z.tuple([z.number().int(), z.number()]));

/** Cache key shared by the finder result and the baseline playoff sim (m1, m2). */
function tradeInputsHash(h: DbHandle): string {
  const payload = JSON.stringify({
    rosters: lastSuccessAt(h, "rosters"),
    stats: lastSuccessAt(h, "stats"),
    projections: lastSuccessAt(h, "projections"),
    state: lastSuccessAt(h, "state"),
    matchups: lastSuccessAt(h, "matchups"),
    leagues: lastSuccessAt(h, "league"),
    players: lastSuccessAt(h, "players"),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function playoffContext(h: DbHandle, leagueId: string, now: Date): PlayoffContext | null {
  const build = loadPlayoffOddsBuild(h, leagueId, now);
  if (build === null || build.input.schedule.length === 0) return null;
  const key = { leagueId, week: 0, kind: "trade-playoff-before", inputsHash: tradeInputsHash(h) };
  const cached = BaselineSchema.safeParse(getComputed(h, key));
  if (cached.success) return { build, before: new Map(cached.data) };
  const sim = simulatePlayoffOdds(build.input);
  const entries = sim.teams.map((t) => [t.rosterId, t.playoffPct] as [number, number]);
  putComputed(h, key, entries, now);
  return { build, before: new Map(entries) };
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
  playoff: PlayoffState,
  own: boolean,
): TradeTeamImpact {
  const reasons: Reason[] = relabel(side.reasons, refs, own);
  if (playoff === "not_computed") reasons.push(PLAYOFF_NOT_COMPUTED_REASON);
  else if (playoff === null) reasons.push(NO_PLAYOFF_REASON);
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
    playoffPctBefore: typeof playoff === "object" && playoff !== null ? playoff.before : null,
    playoffPctAfter: typeof playoff === "object" && playoff !== null ? playoff.after : null,
    playoffPctDelta:
      typeof playoff === "object" && playoff !== null ? playoff.after - playoff.before : null,
    dropped: side.dropped.map((id) => ref(refs, id)),
    reasons,
  };
}

function playoffFor(
  ctx: PlayoffContext | null,
  trade: { mine: TradeSideResult; theirs: TradeSideResult },
): { mine: PlayoffPair | null; theirs: PlayoffPair | null } {
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
    ...sideReasonIds(result.mine, result.theirs),
    ...reasonPlayerIds(result.reasons),
  ]);
  const po = playoffFor(playoffContext(h, leagueId, now), result);
  const response = TradeEvaluateResponseSchema.parse({
    give: result.give.map((id) => ref(refs, id)),
    get: result.get.map((id) => ref(refs, id)),
    mine: impact(result.mine, refs, po.mine, true),
    theirs: impact(result.theirs, refs, po.theirs, false),
    fairness: result.fairness,
    reasons: relabel(result.reasons, refs, true),
    freshness: freshnessFor(h, now),
  });
  return { ok: true, data: response };
}

// ---- Finder ----

const CachedFinderSchema = z.strictObject({
  suggestions: z.array(TradeSuggestionSchema),
  evaluatedCount: z.number().int().min(0),
});

function toSuggestion(
  t: FoundTrade,
  refs: ReadonlyMap<string, TradePlayerRef>,
  po: { mine: PlayoffState; theirs: PlayoffState },
): TradeSuggestion {
  return {
    otherRosterId: t.otherRosterId,
    give: t.give.map((id) => ref(refs, id)),
    get: t.get.map((id) => ref(refs, id)),
    mine: impact(t.mine, refs, po.mine, true),
    theirs: impact(t.theirs, refs, po.theirs, false),
    fairness: t.fairness,
    reasons: relabel(t.reasons, refs, true),
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
  const inputsHash = tradeInputsHash(h);
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
    found.suggestions.flatMap((t) => [
      ...t.give,
      ...t.get,
      ...sideReasonIds(t.mine, t.theirs),
      ...reasonPlayerIds(t.reasons),
    ]),
  );
  const ctx = found.suggestions.length > 0 ? playoffContext(h, leagueId, now) : null;
  const suggestions = found.suggestions.map((t, i) =>
    toSuggestion(
      t,
      refs,
      i < TRADE_FINDER_PLAYOFF_TOP_N
        ? playoffFor(ctx, t)
        : ctx === null
          ? { mine: null, theirs: null }
          : { mine: "not_computed" as const, theirs: "not_computed" as const },
    ),
  );
  const payload = CachedFinderSchema.parse({ suggestions, evaluatedCount: found.evaluatedCount });
  putComputed(h, { leagueId, week: 0, kind, inputsHash }, payload, now);
  return {
    ok: true,
    data: TradeFinderResponseSchema.parse({ ...payload, freshness: freshnessFor(h, now) }),
  };
}
