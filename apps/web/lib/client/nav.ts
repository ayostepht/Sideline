import type { PlayerSearchResult } from "@sideline/shared";

export const MAX_WEEK = 18;
export const MIN_SEARCH_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 200;

export type NavKey =
  "home" | "lineup" | "matchup" | "waivers" | "players" | "league" | "team" | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
  /** Path segment below /l/{leagueId}; empty for Home. */
  segment: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", label: "Home", segment: "" },
  { key: "lineup", label: "Lineup", segment: "lineup" },
  { key: "matchup", label: "Matchup", segment: "matchup" },
  { key: "waivers", label: "Waivers", segment: "waivers" },
  { key: "players", label: "Players", segment: "players" },
  { key: "league", label: "League", segment: "league" },
  { key: "team", label: "My Team", segment: "team" },
  { key: "settings", label: "Settings", segment: "settings" },
];

/** Mobile tab bar shows these; the rest live in the More sheet. */
export const PRIMARY_TAB_KEYS: readonly NavKey[] = ["home", "lineup", "matchup", "waivers"];

export const primaryItems = (): NavItem[] =>
  NAV_ITEMS.filter((i) => PRIMARY_TAB_KEYS.includes(i.key));
export const moreItems = (): NavItem[] =>
  NAV_ITEMS.filter((i) => !PRIMARY_TAB_KEYS.includes(i.key));

/** A valid whole week 1 to 18, else null. Accepts a string or the first of repeated params. */
export function parseWeek(raw: string | readonly string[] | null | undefined): number | null {
  const v: string | null | undefined = typeof raw === "string" || raw == null ? raw : raw[0];
  if (typeof v !== "string" || !/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_WEEK ? n : null;
}

export function clampWeek(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_WEEK, Math.max(1, Math.trunc(n)));
}

/** Week after moving `delta` from `base`, or null when that leaves 1 to 18. */
export function stepWeek(base: number, delta: number): number | null {
  const next = base + delta;
  return next < 1 || next > MAX_WEEK ? null : next;
}

/** Selected week: explicit ?week= wins, else the league's current week, else null (preseason). */
export function resolveWeek(
  raw: string | null | undefined,
  currentWeek: number | null,
): number | null {
  return parseWeek(raw) ?? (currentWeek === null ? null : clampWeek(currentWeek));
}

export function leagueBase(leagueId: string): string {
  return `/l/${encodeURIComponent(leagueId)}`;
}

export function navHref(leagueId: string, item: NavItem, week: number | null): string {
  const base =
    item.segment === "" ? leagueBase(leagueId) : `${leagueBase(leagueId)}/${item.segment}`;
  return week === null ? base : `${base}?week=${week}`;
}

export function isNavActive(pathname: string, leagueId: string, item: NavItem): boolean {
  const path = pathname.replace(/\/+$/, "");
  const home = leagueBase(leagueId);
  if (item.segment === "") return path === home;
  const target = `${home}/${item.segment}`;
  return path === target || path.startsWith(`${target}/`);
}

export function activeNavKey(pathname: string, leagueId: string): NavKey | null {
  return NAV_ITEMS.find((i) => isNavActive(pathname, leagueId, i))?.key ?? null;
}

/** Same params with `week` set, other params kept. Returns a query string without "?" prefix. */
export function withWeekParam(search: string, week: number): string {
  const p = new URLSearchParams(search);
  p.set("week", String(clampWeek(week)));
  return p.toString();
}

/** Where selecting a search result goes. Free agents have no page yet (null: open the sheet). */
export function searchResultHref(leagueId: string, r: PlayerSearchResult): string | null {
  if (r.owner === null) return null;
  return `${leagueBase(leagueId)}/league/teams/${r.owner.rosterId}?highlight=${encodeURIComponent(r.playerId)}`;
}

/** Trimmed query, or null when too short to search. */
export function normalizeSearchQuery(q: string): string | null {
  const t = q.trim();
  return t.length >= MIN_SEARCH_CHARS ? t.slice(0, 40) : null;
}

/**
 * Where a league switch lands: same section and explicit ?week= under the new league.
 * Team detail pages are league specific, so they fall back to the League section.
 */
export function switchLeagueHref(
  pathname: string,
  search: string,
  fromLeagueId: string,
  toLeagueId: string,
): string {
  const from = leagueBase(fromLeagueId);
  const to = leagueBase(toLeagueId);
  const path = pathname.replace(/\/+$/, "");
  if (path !== from && !path.startsWith(`${from}/`)) return to;
  let rest = path.slice(from.length);
  if (rest.startsWith("/league/teams")) rest = "/league";
  const week = parseWeek(new URLSearchParams(search).get("week"));
  return `${to}${rest}${week === null ? "" : `?week=${week}`}`;
}
