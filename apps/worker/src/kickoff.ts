import { kickoffUtc } from "@sideline/providers";

/**
 * ADR-002 item 6 fallback: 13:00 America/New_York on Sundays, 20:00 on any other weekday. `gameday`
 * is a calendar date (YYYY-MM-DD). Converted with the IANA zone, so DST is handled. Returns an ISO
 * 8601 UTC string ending in `.000Z` (the format `kickoffUtc` emits), or null for an invalid date.
 */
export function fallbackKickoffUtc(gameday: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday.trim());
  if (!m) return null;
  const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return kickoffUtc(gameday, weekday === 0 ? "13:00" : "20:00");
}
