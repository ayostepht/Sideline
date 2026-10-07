import { GAME_CLOCK_ENV, parseGameClockOverride } from "@sideline/shared";
import { getLogger } from "./logger";

/**
 * Operator-settable football-domain clock. `SIDELINE_GAME_CLOCK` (strict ISO 8601 UTC, e.g.
 * `2026-10-02T12:00:00Z`) pins what the app treats as "now" for lineup locks, matchups, waivers,
 * league intelligence and player reads, so frozen fixture data stays usable (e2e, demos).
 *
 * It must NEVER be used for auth, sessions, cookie expiry, rate limiting, sync request
 * timestamps, cache TTLs, request logging or health heartbeat age: those use real time.
 * The value comes only from the process environment, never from request input.
 */
export { GAME_CLOCK_ENV, parseGameClockOverride };

let cache: { raw: string | undefined; value: Date | null } | null = null;

function resolve(): Date | null {
  const raw = process.env[GAME_CLOCK_ENV];
  if (cache !== null && cache.raw === raw) return cache.value;
  const value = parseGameClockOverride(raw);
  cache = { raw, value };
  if (value !== null) {
    getLogger().warn(
      { gameClock: value.toISOString() },
      `${GAME_CLOCK_ENV} is set: game clock pinned`,
    );
  }
  return value;
}

/** Football-domain "now". Pinned when SIDELINE_GAME_CLOCK is set, else a fresh real Date. */
export function gameNow(): Date {
  const pinned = resolve();
  return pinned === null ? new Date() : new Date(pinned.getTime());
}

/** True when the override is active (throws on an invalid value, like gameNow). */
export function isGameClockPinned(): boolean {
  return resolve() !== null;
}

/** Test helper: forgets the parsed override. */
export function resetGameClockForTests(): void {
  cache = null;
}
