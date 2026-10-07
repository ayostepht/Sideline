import type { Reason, TradeFairness, TradeTeamImpact } from "@sideline/shared";
import { leagueBase } from "../../../../../lib/client/nav";

/** Mirrors TRADE_MAX_PLAYERS_PER_SIDE (a test keeps them equal) so client code skips the shared runtime. */
export const TRADE_MAX_PER_SIDE = 3;

export type TradesTab = "finder" | "analyzer";

export const BEST_LINEUP_TIP =
  "Best lineup (rest of season): the points your strongest lineup is projected to score from now to the end of the regular season.";
export const FAIRNESS_TIP =
  "Compares how much each team gains. It is a guide, not a prediction of whether they will accept.";

export const FAIRNESS_LABEL: Record<TradeFairness, string> = {
  fair: "Fair",
  leans_you: "Leans you",
  leans_them: "Leans them",
  lopsided: "Lopsided",
};

function first(raw: string | readonly string[] | null | undefined): string | undefined {
  return typeof raw === "string" ? raw : (raw?.[0] ?? undefined);
}

export function parseTab(raw: string | readonly string[] | null | undefined): TradesTab {
  return first(raw) === "analyzer" ? "analyzer" : "finder";
}

/** A positive whole roster id, else null. */
export function parseOther(raw: string | readonly string[] | null | undefined): number | null {
  const v = first(raw);
  return v !== undefined && /^\d{1,4}$/.test(v) && Number(v) > 0 ? Number(v) : null;
}

/** Unique, non-empty player ids from a comma list, capped at the per-side maximum. */
export function parseIdList(raw: string | readonly string[] | null | undefined): string[] {
  const v = first(raw);
  if (v === undefined) return [];
  const ids = v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s.length <= 32);
  return [...new Set(ids)].slice(0, TRADE_MAX_PER_SIDE);
}

export interface TradeSelection {
  other: number | null;
  give: readonly string[];
  get: readonly string[];
}

/** Query string for the page (no "?"), e.g. `tab=analyzer&other=3&give=a,b&get=c`. */
export function buildTradesQuery(tab: TradesTab, sel?: TradeSelection): string {
  const p = new URLSearchParams();
  if (tab === "analyzer") p.set("tab", "analyzer");
  if (sel?.other != null) p.set("other", String(sel.other));
  if (sel && sel.give.length > 0) p.set("give", sel.give.join(","));
  if (sel && sel.get.length > 0) p.set("get", sel.get.join(","));
  return p.toString().replace(/%2C/g, ",");
}

export function tradesHref(leagueId: string, tab: TradesTab, sel?: TradeSelection): string {
  const q = buildTradesQuery(tab, sel);
  return `${leagueBase(leagueId)}/trades${q === "" ? "" : `?${q}`}`;
}

/** Evaluate route URL, or null when the selection is incomplete. */
export function buildEvaluateUrl(leagueId: string, sel: TradeSelection): string | null {
  if (sel.other === null || sel.give.length === 0 || sel.get.length === 0) return null;
  if (sel.give.length > TRADE_MAX_PER_SIDE || sel.get.length > TRADE_MAX_PER_SIDE) {
    return null;
  }
  const q = `other=${String(sel.other)}&give=${sel.give.map(encodeURIComponent).join(",")}&get=${sel.get.map(encodeURIComponent).join(",")}`;
  return `/api/l/${encodeURIComponent(leagueId)}/trades/evaluate?${q}`;
}

/** Toggles an id, refusing to go over the cap. */
export function toggleId(list: readonly string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= max ? [...list] : [...list, id];
}

export function formatPts(n: number): string {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

export function formatLineupDelta(n: number): string {
  return `${formatPts(n)} pts`;
}

const pct = (n: number): string => `${String(Math.round(n * 100))}%`;

/** "Playoffs 41% to 47%", or null when odds were not computed. */
export function formatPlayoff(i: Pick<TradeTeamImpact, "playoffPctBefore" | "playoffPctAfter">) {
  if (i.playoffPctBefore === null || i.playoffPctAfter === null) return null;
  return `Playoffs ${pct(i.playoffPctBefore)} to ${pct(i.playoffPctAfter)}`;
}

/** Why odds are missing, from the reasons, in plain words. */
export function playoffMissingText(reasons: readonly Reason[]): string {
  const r = reasons.find(
    (x) => x.code === "TRADE_PLAYOFF_UNAVAILABLE" || x.code === "TRADE_PLAYOFF_NOT_COMPUTED",
  );
  return r?.label ?? "Playoff odds are not available.";
}

const HIDDEN_CODES = new Set(["TRADE_PLAYOFF_UNAVAILABLE", "TRADE_PLAYOFF_NOT_COMPUTED"]);

/** Trade, my side and their side reasons merged, without duplicates or the playoff-missing note. */
export function mergeReasons(
  trade: readonly Reason[],
  mine: readonly Reason[],
  theirs: readonly Reason[],
): Reason[] {
  const seen = new Set<string>();
  const out: Reason[] = [];
  for (const r of [...trade, ...mine, ...theirs]) {
    if (HIDDEN_CODES.has(r.code)) continue;
    const key = `${r.code}|${r.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function listNames(players: readonly { name: string }[]): string {
  return players.map((p) => p.name).join(", ");
}

/** Spoken summary for the live region after an evaluation. */
export function resultAnnouncement(
  fairness: TradeFairness,
  mine: Pick<TradeTeamImpact, "rosLineupDelta">,
  theirs: Pick<TradeTeamImpact, "rosLineupDelta">,
): string {
  return `Trade evaluated. Your best lineup ${formatLineupDelta(mine.rosLineupDelta)} rest of season. Their best lineup ${formatLineupDelta(theirs.rosLineupDelta)}. ${FAIRNESS_LABEL[fairness]}.`;
}
