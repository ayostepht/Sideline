import type {
  PlayerMomentumLabel,
  PlayerTrendSignal,
  PlayerUsageField,
  PlayerWeeklyPoint,
} from "@sideline/shared";
import { leagueBase } from "../../../../../lib/client/nav";
import { formatCount } from "../../../../../lib/client/format-count";
import type { Trend } from "../../../../../components/trend";

/**
 * T4.6b (PLAN 6.4): page size for the players explorer, matching `PLAYERS_LIST_DEFAULT_PAGE_SIZE`
 * in `packages/shared/src/api/players.ts`. Duplicated as a literal rather than imported: that
 * constant lives in the same module as the players zod schemas, and `format.ts` is reachable from
 * the client-side `PlayersExplorer`, so importing any runtime value from it (even a number) would
 * pull zod's schema-construction code into the route's first-load JS (this is how T4.6b found the
 * players route over its 170 KB soft budget; see the task report). `PlayersListRequestSchema`
 * still enforces the real default server side if these two ever drift.
 */
export const PLAYERS_PAGE_SIZE = 25;

/** Skill positions worth filtering by. IDP (DL/LB/DB) are out of scope: this league's roster
 * settings (read at render time) never require them, and `readPlayers` has no IDP data today. */
export const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type PositionFilter = (typeof POSITION_FILTERS)[number];

/** A known position filter from a `?position=` query param, else undefined ("All"). */
export function parsePositionParam(
  raw: string | readonly string[] | null | undefined,
): PositionFilter | undefined {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  const upper = v?.trim().toUpperCase();
  return upper !== undefined && (POSITION_FILTERS as readonly string[]).includes(upper)
    ? (upper as PositionFilter)
    : undefined;
}

/** Trimmed search text (max 40 chars, matching the API's limit) from a `?q=` query param, else
 * undefined. Also used client side to normalize the search box's live value. */
export function normalizePlayersQuery(raw: string): string | undefined {
  const t = raw.trim();
  return t.length === 0 ? undefined : t.slice(0, 40);
}

export function parseQueryParam(
  raw: string | readonly string[] | null | undefined,
): string | undefined {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  return v === undefined || v === null ? undefined : normalizePlayersQuery(v);
}

/** A page number of 1 or more from a `?page=` query param, else 1. */
export function parsePageParam(raw: string | readonly string[] | null | undefined): number {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  if (typeof v !== "string" || !/^\d+$/.test(v)) return 1;
  const n = Number(v);
  return n >= 1 ? n : 1;
}

/** Path and query for the players list with the given filters; page 1 omits `page`. */
export function buildPlayersHref(
  leagueId: string,
  opts: { page: number; position?: PositionFilter | undefined; q?: string | undefined },
): string {
  const params = new URLSearchParams();
  if (opts.page > 1) params.set("page", String(opts.page));
  if (opts.position !== undefined) params.set("position", opts.position);
  if (opts.q !== undefined) params.set("q", opts.q);
  const qs = params.toString();
  return `${leagueBase(leagueId)}/players${qs ? `?${qs}` : ""}`;
}

export { playerHref } from "../../../../../lib/client/nav";

/** One decimal place, or an em-dash-free "No data" placeholder for null (no games played). */
export function formatPpg(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

/** Signed one-decimal delta with an explicit sign, or the null placeholder. */
export function formatDelta(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toFixed(1);
  return n > 0 ? `+${abs}` : n < 0 ? `-${abs}` : abs;
}

const SIGNAL_TREND: Record<PlayerTrendSignal, Trend> = {
  Rising: "rising",
  Steady: "steady",
  Falling: "falling",
};

/** Maps the server's trend signal to the design system's lowercase `Trend`; null (no games played
 * yet) stays null so the caller can show a "No data" placeholder instead of a misleading icon. */
export function signalToTrend(signal: PlayerTrendSignal | null): Trend | null {
  return signal === null ? null : SIGNAL_TREND[signal];
}

/** Weekly scoring points, sorted ascending by week, for a left-to-right chronological chart. */
export function sortedWeeklySeries(
  series: readonly PlayerWeeklyPoint[],
): readonly PlayerWeeklyPoint[] {
  return [...series].sort((a, b) => a.week - b.week);
}

export const USAGE_FIELD_LABEL: Record<PlayerUsageField, string> = {
  snapPct: "Snap share",
  targetShare: "Target share",
  airYardsShare: "Air yards share",
  carryShare: "Carry share",
  rzTouches: "Red zone touches",
};

/** `rzTouches` is a raw per-game count; the rest are 0 to 1 fractions (see `UsageWeek`). */
const USAGE_PERCENT_FIELDS: ReadonlySet<PlayerUsageField> = new Set([
  "snapPct",
  "targetShare",
  "airYardsShare",
  "carryShare",
]);

export function formatUsageValue(field: PlayerUsageField, value: number | null): string {
  if (value === null) return "—";
  return USAGE_PERCENT_FIELDS.has(field) ? `${Math.round(value * 100)}%` : value.toFixed(1);
}

/** Signed delta in the same unit as {@link formatUsageValue}, or the null placeholder. */
export function formatUsageDelta(field: PlayerUsageField, value: number | null): string {
  if (value === null) return "—";
  const pct = USAGE_PERCENT_FIELDS.has(field);
  const abs = pct ? Math.round(Math.abs(value) * 100) : Number(Math.abs(value).toFixed(1));
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${abs}${pct ? "%" : ""}`;
}

/** Coefficient of variation as a whole percentage ("42%"). */
export function formatConsistency(cv: number): string {
  return `${Math.round(cv * 100)}%`;
}

export const MOMENTUM_TONE: Record<PlayerMomentumLabel, "positive" | "neutral" | "negative"> = {
  Hot: "positive",
  Warm: "positive",
  Neutral: "neutral",
  Cold: "negative",
};

/** Signed net add/drop count, for example "+240" or "-80". */
export function formatNetCount(n: number): string {
  return n > 0 ? `+${formatCount(n)}` : formatCount(n);
}

/** Why the Usage section has nothing to show, or null when there are usage fields. */
export function usageEmptyMessage(usage: {
  fields: readonly unknown[];
  reasons: ReadonlyArray<{ label: string }>;
}): string | null {
  if (usage.fields.length > 0) return null;
  return usage.reasons[0]?.label ?? "No usage data tracked for this position.";
}
