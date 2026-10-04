import pino, { type Logger, type DestinationStream } from "pino";
import { loadConfig } from "@sideline/shared";

/**
 * Structured pino logger for the web API layer, matching the worker's convention
 * (`apps/worker/src/main.ts`): `base: { app: "sideline-<app>" }`, level from config.
 * Never log request bodies or cookie values (could contain the login password or session token).
 */
let cached: Logger | null = null;

/**
 * Returns the process-wide logger, creating it on first call. Pass `destination` only from
 * tests, to capture output instead of writing to stdout; doing so never touches the cached
 * singleton used by production code.
 */
export function getLogger(
  env: Record<string, string | undefined> = process.env,
  destination?: DestinationStream,
): Logger {
  if (cached !== null && destination === undefined) return cached;
  let level = "info";
  try {
    level = loadConfig(env).logLevel;
  } catch {
    // Invalid config is reported elsewhere (loadConfig throws at startup); fall back to "info"
    // so a bad env var never breaks logging itself.
  }
  const instance =
    destination === undefined
      ? pino({ level, base: { app: "sideline-web" } })
      : pino({ level, base: { app: "sideline-web" } }, destination);
  if (destination === undefined) cached = instance;
  return instance;
}

/** Test helper: forgets the cached singleton so the next `getLogger()` call rebuilds it. */
export function resetLoggerForTests(): void {
  cached = null;
}
