import { z } from "zod";
import { SYNC_JOB_NAMES, type SyncJobName } from "./sync.js";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

/** Jobs that have a `SYNC_<JOB>_CRON` override (backfill is manual only). */
export const CRON_JOBS: readonly SyncJobName[] = SYNC_JOB_NAMES.filter(
  (j) => j !== "backfill_2025",
);

/** Env variable name for a job's cron override, for example `SYNC_STATE_CRON`. */
export function cronEnvName(job: string): string {
  return `SYNC_${job.toUpperCase()}_CRON`;
}

const MONTHS = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
const DAYS = "SUN|MON|TUE|WED|THU|FRI|SAT";

/** Allowed numeric range per field position; the 6-field form has a leading seconds field. */
const CRON_RANGES_5: readonly (readonly [number, number, string?])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12, MONTHS],
  [0, 7, DAYS],
];

function cronValueOk(v: string, min: number, max: number, names?: string): boolean {
  if (/^\d+$/.test(v)) return Number(v) >= min && Number(v) <= max;
  return names !== undefined && new RegExp(`^(${names})$`, "i").test(v);
}

function cronFieldOk(
  field: string,
  [min, max, names]: readonly [number, number, string?],
): boolean {
  return field.split(",").every((item) => {
    const [base, step, ...extra] = item.split("/");
    if (extra.length > 0 || base === undefined || base === "") return false;
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) return false;
    if (base === "*") return true;
    const range = base.split("-");
    if (range.length > 2) return false;
    return range.every((v) => cronValueOk(v, min, max, names));
  });
}

/** True for a 5 or 6 field cron expression with valid grammar and numeric ranges per position. */
export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return false;
  const ranges = fields.length === 6 ? [[0, 59] as const, ...CRON_RANGES_5] : CRON_RANGES_5;
  return fields.every((f, i) => {
    const r = ranges[i];
    return r !== undefined && cronFieldOk(f, r);
  });
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Env variable that pins the football-domain clock (web only; the worker ignores it). */
export const GAME_CLOCK_ENV = "SIDELINE_GAME_CLOCK";

const IsoUtcSchema = z.string().datetime();

/** Returns the pinned Date, or null when unset. Throws (naming the variable) on invalid input. */
export function parseGameClockOverride(raw: string | undefined): Date | null {
  if (raw === undefined) return null;
  const parsed = IsoUtcSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${GAME_CLOCK_ENV} must be an ISO 8601 UTC datetime like 2026-10-02T12:00:00Z (got ${JSON.stringify(raw)}).`,
    );
  }
  return new Date(parsed.data);
}

/** Validated application config. Optional values are null when unset. */
export const AppConfigSchema = z.strictObject({
  sleeperUsername: z.string().nullable(),
  defaultLeagueId: z.string().nullable(),
  dataDir: z.string(),
  tz: z.string(),
  appPassword: z.string().nullable(),
  sessionSecret: z.string().nullable(),
  puid: z.number().int().min(0).max(65535),
  pgid: z.number().int().min(0).max(65535),
  enableNflverse: z.boolean(),
  oddsApiKey: z.string().nullable(),
  /** Cron overrides keyed by job; only jobs with an override are present. */
  syncCron: z.partialRecord(z.string(), z.string()),
  logLevel: z.enum(LOG_LEVELS),
  port: z.number().int().min(1).max(65535),
  /** Normalized ISO UTC instant from SIDELINE_GAME_CLOCK, or null when unset. */
  gameClock: z.string().nullable(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Thrown by {@link loadConfig}; `issues` lists each invalid variable with its fix. */
export class ConfigError extends Error {
  readonly issues: { variable: string; message: string }[];
  constructor(issues: { variable: string; message: string }[]) {
    super(
      `Invalid configuration:\n${issues.map((i) => `  - ${i.variable}: ${i.message}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}

/**
 * Pure: validates `env` (never reads process.env). Empty strings count as unset. Throws
 * {@link ConfigError} listing every problem.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const issues: { variable: string; message: string }[] = [];
  const fail = (variable: string, message: string): void => {
    issues.push({ variable, message });
  };
  const get = (k: string): string | undefined => {
    const v = env[k]?.trim();
    return v === undefined || v === "" ? undefined : v;
  };
  const int = (k: string, def: number, min: number, max: number): number => {
    const v = get(k);
    if (v === undefined) return def;
    if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) {
      fail(
        k,
        `must be a whole number from ${min} to ${max} (got "${v}"). Fix it or leave it empty for ${def}.`,
      );
      return def;
    }
    return Number(v);
  };
  const bool = (k: string, def: boolean): boolean => {
    const v = get(k)?.toLowerCase();
    if (v === undefined) return def;
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    fail(k, `must be true, false, 1 or 0 (got "${v}"). Fix it or leave it empty for ${def}.`);
    return def;
  };

  const appPassword = get("APP_PASSWORD") ?? null;
  const sessionSecret = get("SESSION_SECRET") ?? null;
  if (appPassword !== null) {
    if (sessionSecret === null) {
      fail(
        "SESSION_SECRET",
        "is required when APP_PASSWORD is set. Generate one with: openssl rand -hex 32",
      );
    } else if (sessionSecret.length < 32) {
      fail(
        "SESSION_SECRET",
        `must be at least 32 characters (got ${sessionSecret.length}). Generate one with: openssl rand -hex 32`,
      );
    }
  } else if (sessionSecret !== null && sessionSecret.length < 32) {
    fail(
      "SESSION_SECRET",
      `must be at least 32 characters when set (got ${sessionSecret.length}). Generate one with: openssl rand -hex 32`,
    );
  }

  const syncCron: Record<string, string> = {};
  for (const job of CRON_JOBS) {
    const name = cronEnvName(job);
    const v = get(name);
    if (v === undefined) continue;
    const fields = v.split(/\s+/);
    if (!isValidCron(v)) {
      fail(
        name,
        `must be a cron expression with 5 or 6 fields, for example "*/15 * * * *" (got "${v}"). Fix it or leave it empty for the default.`,
      );
    } else {
      syncCron[job] = fields.join(" ");
    }
  }

  const tz = get("TZ") ?? "America/New_York";
  if (!isValidTimeZone(tz)) {
    fail("TZ", `must be a valid IANA time zone such as "America/New_York" (got "${tz}").`);
  }

  const logRaw = get("LOG_LEVEL")?.toLowerCase();
  let logLevel: (typeof LOG_LEVELS)[number] = "info";
  if (logRaw !== undefined) {
    const found = LOG_LEVELS.find((l) => l === logRaw);
    if (found === undefined)
      fail("LOG_LEVEL", `must be one of ${LOG_LEVELS.join(", ")} (got "${logRaw}").`);
    else logLevel = found;
  }

  let gameClock: string | null = null;
  try {
    gameClock = parseGameClockOverride(get(GAME_CLOCK_ENV))?.toISOString() ?? null;
  } catch (e) {
    fail(GAME_CLOCK_ENV, (e instanceof Error ? e.message : String(e)).replace(/^\S+ /, ""));
  }

  const config = {
    sleeperUsername: get("SLEEPER_USERNAME") ?? null,
    defaultLeagueId: get("DEFAULT_LEAGUE_ID") ?? null,
    dataDir: get("DATA_DIR") ?? "/data",
    tz,
    appPassword,
    sessionSecret,
    puid: int("PUID", 99, 0, 65535),
    pgid: int("PGID", 100, 0, 65535),
    enableNflverse: bool("ENABLE_NFLVERSE", true),
    oddsApiKey: get("ODDS_API_KEY") ?? null,
    syncCron,
    logLevel,
    port: int("PORT", 3000, 1, 65535),
    gameClock,
  };

  if (issues.length > 0) throw new ConfigError(issues);
  return AppConfigSchema.parse(config);
}
