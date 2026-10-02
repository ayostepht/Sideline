/**
 * Typed identity settings in app_settings (ADR-009 item 3). Env seeding is the caller's job:
 * `resolveIdentity` returns DB values when set, else the env defaults.
 */
import { eq } from "drizzle-orm";
import type { DbHandle } from "./connection.js";
import { appSettings } from "./schema.js";
import { getSetting, setSetting } from "./sync-bookkeeping.js";

export const SETTING_SLEEPER_USERNAME = "sleeper_username";
export const SETTING_SLEEPER_USER_ID = "sleeper_user_id";
export const SETTING_ACTIVE_LEAGUE_ID = "active_league_id";

export interface Identity {
  sleeperUsername: string | null;
  sleeperUserId: string | null;
  activeLeagueId: string | null;
}

function setOrClear(h: DbHandle, key: string, value: string | null): void {
  if (value === null) h.db.delete(appSettings).where(eq(appSettings.key, key)).run();
  else setSetting(h, key, value);
}

export const getSleeperUsername = (h: DbHandle): string | null =>
  getSetting(h, SETTING_SLEEPER_USERNAME);
export const setSleeperUsername = (h: DbHandle, v: string | null): void =>
  setOrClear(h, SETTING_SLEEPER_USERNAME, v);
export const getSleeperUserId = (h: DbHandle): string | null =>
  getSetting(h, SETTING_SLEEPER_USER_ID);
export const setSleeperUserId = (h: DbHandle, v: string | null): void =>
  setOrClear(h, SETTING_SLEEPER_USER_ID, v);
export const getActiveLeagueId = (h: DbHandle): string | null =>
  getSetting(h, SETTING_ACTIVE_LEAGUE_ID);
export const setActiveLeagueId = (h: DbHandle, v: string | null): void =>
  setOrClear(h, SETTING_ACTIVE_LEAGUE_ID, v);

/** DB value when set (non-empty), else the env default, else null. */
export function resolveIdentity(h: DbHandle, envDefaults: Partial<Identity>): Identity {
  const pick = (db: string | null, env: string | null | undefined): string | null =>
    db !== null && db !== "" ? db : env !== undefined && env !== "" ? env : null;
  return {
    sleeperUsername: pick(getSleeperUsername(h), envDefaults.sleeperUsername),
    sleeperUserId: pick(getSleeperUserId(h), envDefaults.sleeperUserId),
    activeLeagueId: pick(getActiveLeagueId(h), envDefaults.activeLeagueId),
  };
}
