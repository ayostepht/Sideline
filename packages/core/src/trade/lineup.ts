/**
 * TRADE-1 (lineup half) / TRADE-3 (PLAN 5.9, ADR-022): rest-of-season optimal-lineup math for
 * trades. Mirrors `apps/web/lib/server/roster-strength.ts`: one `recommendLineup` per roster with
 * the player's ROS value as `rawValue`, everyone available and unlocked, reserve/taxi excluded.
 *
 * Formulas:
 * - `rosLineupTotal` = sum of ROS values of the players the optimizer starts.
 * - `applyTrade`: swap the sides; a team receiving k more players than it sends drops its k
 *   lowest-`rosValue` non-reserve players from those it already had (ties: lower playerId first).
 */
import { TRADE_MAX_PLAYERS_PER_SIDE as TRADE_MAX_PLAYERS } from "@sideline/shared";
import { resolveSlots } from "../optimizer/eligibility.js";
import { recommendLineup, type RecommendLineupPlayer } from "../optimizer/recommend.js";

export interface TradePlayer {
  playerId: string;
  fantasyPositions: string[];
  rosValue: number;
  /** IR/taxi: never starts and is never auto-dropped. */
  reserve: boolean;
}

export interface TradeTeam {
  rosterId: number;
  players: TradePlayer[];
}

/** Fixed clock: nobody is locked in a ROS valuation, so the value is irrelevant. */
const EPOCH = new Date(0);

export interface RosLineup {
  total: number;
  /** Player ids in the optimal lineup. */
  starters: string[];
}

/** Optimal ROS lineup (total and starters) for one roster. Same result as roster-strength. */
export function rosLineup(rosterPositions: readonly string[], team: TradeTeam): RosLineup {
  const { slots, warnings } = resolveSlots(rosterPositions);
  const valueById = new Map<string, number>();
  const players: RecommendLineupPlayer[] = [];
  for (const p of team.players) {
    if (p.reserve) continue;
    valueById.set(p.playerId, p.rosValue);
    players.push({
      playerId: p.playerId,
      fantasyPositions: p.fantasyPositions,
      rawValue: p.rosValue,
      status: null,
      isBye: false,
      kickoffUtc: null,
      kickoffApproximate: false,
    });
  }
  const result = recommendLineup({
    slots,
    slotWarnings: warnings,
    players,
    currentAssignment: slots.map(() => null),
    now: EPOCH,
  });
  let total = 0;
  const starters: string[] = [];
  for (const a of result.optimalAssignment) {
    if (a.playerId === null) continue;
    total += valueById.get(a.playerId) ?? 0;
    starters.push(a.playerId);
  }
  return { total, starters };
}

/** TRADE-1: ROS optimal-lineup total for a roster. */
export function rosLineupTotal(rosterPositions: readonly string[], team: TradeTeam): number {
  return rosLineup(rosterPositions, team).total;
}

export type ApplyTradeErrorCode =
  "EMPTY_SIDE" | "TOO_MANY_PLAYERS" | "DUPLICATE_PLAYER" | "PLAYER_NOT_ON_ROSTER";

export interface ApplyTradeSuccess {
  ok: true;
  mine: TradeTeam;
  theirs: TradeTeam;
  /** Player ids auto-dropped from my roster / their roster (TRADE-3). */
  droppedMine: string[];
  droppedTheirs: string[];
}
export interface ApplyTradeError {
  ok: false;
  code: ApplyTradeErrorCode;
  message: string;
}

function fail(code: ApplyTradeErrorCode, message: string): ApplyTradeError {
  return { ok: false, code, message };
}

function autoDrop(original: readonly TradePlayer[], count: number): Set<string> {
  const candidates = original
    .filter((p) => !p.reserve)
    .sort((a, b) => a.rosValue - b.rosValue || (a.playerId < b.playerId ? -1 : 1));
  return new Set(candidates.slice(0, count).map((p) => p.playerId));
}

/** TRADE-1/TRADE-3: swap `give` (mine to theirs) for `get` (theirs to mine), with auto-drops. */
export function applyTrade(
  mine: TradeTeam,
  theirs: TradeTeam,
  give: readonly string[],
  get: readonly string[],
): ApplyTradeSuccess | ApplyTradeError {
  if (give.length === 0 || get.length === 0) return fail("EMPTY_SIDE", "Each side needs a player");
  if (give.length > TRADE_MAX_PLAYERS || get.length > TRADE_MAX_PLAYERS) {
    return fail("TOO_MANY_PLAYERS", `At most ${TRADE_MAX_PLAYERS} players per side`);
  }
  if (new Set(give).size !== give.length || new Set(get).size !== get.length) {
    return fail("DUPLICATE_PLAYER", "A player is listed twice");
  }
  const mineById = new Map(mine.players.map((p) => [p.playerId, p] as const));
  const theirsById = new Map(theirs.players.map((p) => [p.playerId, p] as const));
  const giving: TradePlayer[] = [];
  for (const id of give) {
    const p = mineById.get(id);
    if (p === undefined) return fail("PLAYER_NOT_ON_ROSTER", `${id} is not on your roster`);
    giving.push(p);
  }
  const getting: TradePlayer[] = [];
  for (const id of get) {
    const p = theirsById.get(id);
    if (p === undefined) return fail("PLAYER_NOT_ON_ROSTER", `${id} is not on their roster`);
    getting.push(p);
  }
  const giveSet = new Set(give);
  const getSet = new Set(get);
  const myDrops = autoDrop(
    mine.players.filter((p) => !giveSet.has(p.playerId)),
    Math.max(0, get.length - give.length),
  );
  const theirDrops = autoDrop(
    theirs.players.filter((p) => !getSet.has(p.playerId)),
    Math.max(0, give.length - get.length),
  );
  const newMine: TradeTeam = {
    rosterId: mine.rosterId,
    players: [
      ...mine.players.filter((p) => !giveSet.has(p.playerId) && !myDrops.has(p.playerId)),
      ...getting,
    ],
  };
  const newTheirs: TradeTeam = {
    rosterId: theirs.rosterId,
    players: [
      ...theirs.players.filter((p) => !getSet.has(p.playerId) && !theirDrops.has(p.playerId)),
      ...giving,
    ],
  };
  return {
    ok: true,
    mine: newMine,
    theirs: newTheirs,
    droppedMine: [...myDrops].sort(),
    droppedTheirs: [...theirDrops].sort(),
  };
}
