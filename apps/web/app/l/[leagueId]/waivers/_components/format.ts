import type {
  ClaimAdvice,
  CompetingTeam,
  Reason,
  TeamPlayerRow,
  WaiverCandidate,
  WaiverTrendSignal,
} from "@sideline/shared";
import type { Trend } from "../../../../../components/trend";
import { leagueBase } from "../../../../../lib/client/nav";

/** The two WAIVER-4 views (PLAN 6.4): "For my team" sorts by Lineup Impact, "Best available" by
 * rest-of-season value. Kept as short internal keys; `VIEW_LABEL` carries the display copy. */
export type WaiverView = "mine" | "available";

export const VIEW_LABEL: Record<WaiverView, string> = {
  mine: "For my team",
  available: "Best available",
};

/** Standard offense/defense fantasy positions a candidate can carry (`FANTASY_POSITIONS` in
 * `@sideline/sleeper`). The position filter offers exactly these, matching what `fantasyPositions`
 * can ever contain for a waiver candidate. */
export const WAIVER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type WaiverPosition = (typeof WAIVER_POSITIONS)[number];

/** A valid view key from a `?view=` query param, else the default "mine". */
export function parseView(raw: string | readonly string[] | null | undefined): WaiverView {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  return v === "available" ? "available" : "mine";
}

/** Positions from a `?positions=` query param (comma separated), filtered to known positions and
 * returned in `WAIVER_POSITIONS` order so the UI and the built query string are deterministic. */
export function parsePositions(raw: string | readonly string[] | null | undefined): string[] {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  if (typeof v !== "string" || v.trim() === "") return [];
  const requested = new Set(v.split(",").map((p) => p.trim().toUpperCase()));
  return WAIVER_POSITIONS.filter((p) => requested.has(p));
}

/** The waivers API query string for a given week/position filter (`positions` omitted when empty,
 * matching `WaiverRequestSchema`'s "omitted means no filter" convention). */
export function buildWaiversQuery(week: number, positions: readonly string[]): string {
  const params = new URLSearchParams();
  params.set("week", String(week));
  if (positions.length > 0) params.set("positions", positions.join(","));
  return params.toString();
}

/** Path and query for deep-linking the waivers page itself (view plus position filter kept, week
 * carried over). Used to sync the address bar without a page navigation (see `waiver-board.tsx`). */
export function buildWaiversPageQuery(
  week: number,
  view: WaiverView,
  positions: readonly string[],
): string {
  const params = new URLSearchParams();
  params.set("week", String(week));
  if (view !== "mine") params.set("view", view);
  if (positions.length > 0) params.set("positions", positions.join(","));
  return params.toString();
}

export function waiversPath(leagueId: string): string {
  return `${leagueBase(leagueId)}/waivers`;
}

/** One decimal, always signed ("+3.4 pts", "-1.2 pts", "+0.0 pts"). Mirrors the Lineup page's own
 * identical helper (house pattern: small formatters are duplicated per feature, not shared). */
export function formatSignedPoints(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  return n < 0 ? `-${abs} pts` : `+${abs} pts`;
}

/** The 0-100 Waiver Score, rounded to a whole number for a clean headline stat. */
export function formatScore(n: number): string {
  return String(Math.round(n));
}

/** WAIVER-4's `WaiverTrendSignal` ("Rising"/"Steady"/"Falling") to the `TrendIndicator` component's
 * lowercase `Trend` key. A plain lowercase, since the two enums share the same three words. */
export function toTrend(signal: WaiverTrendSignal): Trend {
  return signal.toLowerCase() as Trend;
}

/** A reason's numeric `value` by code, or `undefined` when absent or non-numeric. Used to pull the
 * Waiver Score's "Schedule (next 3 weeks)" percentile back out of a candidate's reasons for the
 * row's single aggregate matchup grade (see the module doc in `waiver-board.tsx` for why this is
 * one grade, not three). */
export function reasonValue(reasons: readonly Reason[], code: string): number | undefined {
  const r = reasons.find((x) => x.code === code);
  return typeof r?.value === "number" ? r.value : undefined;
}

export interface DropPlayerInfo {
  name: string;
  position: string | null;
  nflTeam: string | null;
}

/** `TeamPlayerRow[]` (from `getMyTeam`) keyed by player id, for resolving a candidate's
 * `suggestedDropPlayerId` to a name the UI can show (the waivers DTO only carries the id). */
export function dropPlayerMap(
  players: readonly Pick<TeamPlayerRow, "playerId" | "name" | "position" | "nflTeam">[],
): Map<string, DropPlayerInfo> {
  return new Map(
    players.map((p) => [p.playerId, { name: p.name, position: p.position, nflTeam: p.nflTeam }]),
  );
}

/** Plain-language text for a candidate's suggested drop (WAIVER-2). */
export function suggestedDropText(
  suggestedDropPlayerId: string | null,
  drops: ReadonlyMap<string, DropPlayerInfo>,
): string {
  if (suggestedDropPlayerId === null) return "No drop needed";
  return drops.get(suggestedDropPlayerId)?.name ?? "A roster player";
}

/** WAIVER-6b: one `Reason` per team ahead of me that's likely to also compete for this candidate,
 * for a single combined WhySheet (team name folded into the label since the underlying per-team
 * `Reason`s don't carry one). Only flagged (`likelyCompeting`) teams are included; an empty result
 * means the row shouldn't show a competing-claim badge at all. */
export function competingFlagReasons(teams: readonly CompetingTeam[]): Reason[] {
  return teams
    .filter((t) => t.likelyCompeting)
    .map((t) => {
      const need = t.reasons.find((r) => r.code === "TEAM_NEED_LIKELY");
      return {
        code: `COMPETING_TEAM_${String(t.rosterId)}`,
        label: need?.label ?? `${t.teamName} would likely also claim this player`,
      };
    });
}

export interface ClaimBadgeInfo {
  label: string;
  variant: "positive" | "neutral";
}

/** WAIVER-6c badge copy: whether dropping to the back of the waiver order to win this claim pays
 * off, given everything else on the candidate's priority queue. */
export function claimBadgeInfo(advice: ClaimAdvice): ClaimBadgeInfo {
  return advice.worthIt
    ? { label: "Worth claiming", variant: "positive" }
    : { label: "Hold your spot", variant: "neutral" };
}

/** Relative future time ("in 3 hours", "in 2 days"), the mirror image of the freshness module's
 * `formatAge`. Used for WAIVER-6d's next waiver-clear time. */
export function formatUntil(target: string | null, now: Date | number): string {
  if (target === null) return "Unknown";
  const t = Date.parse(target);
  if (Number.isNaN(t)) return "Unknown";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ms = t - nowMs;
  if (ms <= 0) return "any moment";
  const mins = Math.round(ms / 60_000);
  const unit = (n: number, word: string) => `in ${n} ${word}${n === 1 ? "" : "s"}`;
  if (mins < 60) return unit(Math.max(1, mins), "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return unit(hours, "hour");
  return unit(Math.round(hours / 24), "day");
}

/** The headline "insight first" line for the top of the page: the best Lineup Impact candidate for
 * my team, or `null` when there are none (an empty pool, every candidate filtered out server side,
 * or no candidates at all). */
export function topTargetSummary(forMyTeam: readonly WaiverCandidate[]): string | null {
  const top = forMyTeam[0];
  if (top === undefined || top.lineupImpact <= 0) return null;
  return `Top waiver target: ${top.name}, ${formatSignedPoints(top.lineupImpact)} over the next 3 weeks`;
}
