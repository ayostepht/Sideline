/**
 * Fixture "now" for the screens script (ADR-019). Keep in sync with E2E_GAME_CLOCK in
 * playwright.config.ts so screenshots and e2e tests see the same football week.
 * Override with SCREENS_GAME_CLOCK (strict ISO UTC).
 */
export const DEFAULT_SCREENS_GAME_CLOCK = "2026-10-02T12:00:00.000Z";

const STRICT_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function resolveScreensGameClock(env: Record<string, string | undefined>): string {
  const value = env["SCREENS_GAME_CLOCK"];
  if (value === undefined || value === "") return DEFAULT_SCREENS_GAME_CLOCK;
  if (!STRICT_ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`SCREENS_GAME_CLOCK must be a strict ISO UTC time, got "${value}"`);
  }
  return value;
}
