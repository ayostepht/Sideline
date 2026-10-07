import type { PlayerWeekRow } from "@sideline/shared";

/** News older than this triggers a background refresh request. */
export const NEWS_STALE_MS = 60 * 60 * 1000;

/** "@KC" away, "KC" home, "BYE" on a bye, en-dash when the schedule is unknown. */
export function formatOpponent(row: Pick<PlayerWeekRow, "opponent" | "isHome" | "isBye">): string {
  if (row.isBye) return "BYE";
  if (row.opponent === null) return "–";
  return row.isHome === false ? `@${row.opponent}` : row.opponent;
}

export type WeekRowKind = "bye" | "live" | "dnp" | "played";

export function weekRowKind(row: PlayerWeekRow): WeekRowKind {
  if (row.isBye) return "bye";
  if (row.inProgress) return "live";
  if (row.actualPts === null) return "dnp";
  return "played";
}

/** Text for the Pts cell. */
export function formatWeekPts(row: PlayerWeekRow): string {
  const kind = weekRowKind(row);
  if (kind === "bye") return "Bye";
  if (kind === "dnp") return "DNP";
  return row.actualPts === null ? "–" : row.actualPts.toFixed(1);
}

export function formatWeekProj(row: PlayerWeekRow): string {
  return row.projectedPts === null ? "–" : row.projectedPts.toFixed(1);
}

export function formatWeekRank(row: PlayerWeekRow, position: string | null): string {
  if (row.positionRank === null) return "–";
  return `${position ?? ""}${row.positionRank}`;
}

/** Text marker for the result column; null when neither boom nor bust. Boom wins if both are set. */
export function weekResultLabel(row: PlayerWeekRow): "Boom" | "Bust" | null {
  if (weekRowKind(row) !== "played" && weekRowKind(row) !== "live") return null;
  if (row.isBoom) return "Boom";
  if (row.isBust) return "Bust";
  return null;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. Future dates read "just now". */
export function formatRelativeTime(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = now.getTime() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** True when news was never fetched, the timestamp is unreadable, or it is older than 60 minutes. */
export function needsNewsRefresh(lastFetchedAt: string | null | undefined, now: Date): boolean {
  if (lastFetchedAt === null || lastFetchedAt === undefined) return true;
  const t = Date.parse(lastFetchedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > NEWS_STALE_MS;
}

export { initials } from "../../../../../lib/client/initials";

/** The newest news item of kind "note", or undefined. */
export function pickLatestNote<T extends { kind: string; publishedAt: string }>(
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const n of items) {
    if (n.kind !== "note") continue;
    if (!best || Date.parse(n.publishedAt) > Date.parse(best.publishedAt)) best = n;
  }
  return best;
}
