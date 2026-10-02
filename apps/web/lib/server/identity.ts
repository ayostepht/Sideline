import {
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  readNflState,
  readUserLeagues,
  resolveIdentity,
  setActiveLeagueId,
  setSleeperUsername,
  type DbHandle,
  type Identity,
} from "@sideline/db";
import { UserJobParamsSchema, type AppSettingsDto, type LeagueChoice } from "@sideline/shared";

type Env = Record<string, string | undefined>;

function nonEmpty(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t === undefined || t === "" ? undefined : t;
}

/**
 * Stored identity (ADR-009 item 3). On first read, unset DB keys are seeded from
 * SLEEPER_USERNAME / DEFAULT_LEAGUE_ID; after that the DB values win.
 */
export function getIdentity(h: DbHandle, env: Env = process.env): Identity {
  const envUser = nonEmpty(env["SLEEPER_USERNAME"]);
  if (envUser !== undefined && (getSleeperUsername(h) ?? "") === "") {
    const parsed = UserJobParamsSchema.safeParse({ username: envUser });
    if (parsed.success) setSleeperUsername(h, parsed.data.username);
  }
  const envLeague = nonEmpty(env["DEFAULT_LEAGUE_ID"]);
  if (envLeague !== undefined && (getActiveLeagueId(h) ?? "") === "") {
    setActiveLeagueId(h, envLeague);
  }
  return resolveIdentity(h, {});
}

export function getSettings(h: DbHandle, env: Env = process.env): AppSettingsDto {
  const id = getIdentity(h, env);
  return {
    sleeperUsername: id.sleeperUsername,
    sleeperUserId: getSleeperUserId(h),
    activeLeagueId: id.activeLeagueId,
  };
}

/** Leagues for the stored user in the current season (league switcher). Read-only: never enqueues. */
export function getLeagueChoices(h: DbHandle, env: Env = process.env): LeagueChoice[] {
  const userId = getSleeperUserId(h) ?? getIdentity(h, env).sleeperUserId;
  if (userId === null) return [];
  const season = readNflState(h)?.season;
  return readUserLeagues(h, userId, season);
}
