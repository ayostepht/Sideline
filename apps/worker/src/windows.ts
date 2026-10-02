/** Game windows. NFL time logic is always America/New_York. */
export const NFL_TZ = "America/New_York";
export const GAME_LENGTH_MS = 4 * 60 * 60 * 1000;

/** `day`: 0 = Sunday .. 6 = Saturday (ET). Hours are ET, `endHour` 24 means midnight. */
export interface FallbackWindow {
  day: number;
  startHour: number;
  endHour: number;
}

/** PLAN 3.4: Thu 20:00-24:00, Sun 13:00-24:00, Mon 20:00-24:00 ET. */
export const DEFAULT_FALLBACK_WINDOWS: readonly FallbackWindow[] = [
  { day: 4, startHour: 20, endHour: 24 },
  { day: 0, startHour: 13, endHour: 24 },
  { day: 1, startHour: 20, endHour: 24 },
];

const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NFL_TZ,
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Weekday (0 = Sunday) and fractional hour in New York. DST-safe. */
export function easternParts(d: Date): { day: number; hour: number } {
  const parts = fmt.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAYS[get("weekday")] ?? 0;
  return { day, hour: Number(get("hour")) + Number(get("minute")) / 60 };
}

export interface GameKickoff {
  kickoffUtc: string | null;
}

/**
 * True from kickoff to kickoff + 4 h for any game. When no game has a kickoff, falls back to
 * the fixed weekly windows.
 */
export function isGameWindow(
  now: Date,
  games: readonly GameKickoff[],
  fallback: readonly FallbackWindow[] = DEFAULT_FALLBACK_WINDOWS,
): boolean {
  const kickoffs: number[] = [];
  for (const g of games) {
    if (g.kickoffUtc === null) continue;
    const t = Date.parse(g.kickoffUtc);
    if (!Number.isNaN(t)) kickoffs.push(t);
  }
  if (kickoffs.length > 0) {
    const n = now.getTime();
    return kickoffs.some((k) => n >= k && n < k + GAME_LENGTH_MS);
  }
  const { day, hour } = easternParts(now);
  return fallback.some((w) => w.day === day && hour >= w.startHour && hour < w.endHour);
}
