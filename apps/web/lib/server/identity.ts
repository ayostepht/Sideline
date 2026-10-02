import {
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  resolveIdentity,
  setActiveLeagueId,
  setSleeperUsername,
  type DbHandle,
  type Identity,
} from "@sideline/db";
import { UserJobParamsSchema, type AppSettingsDto } from "@sideline/shared";

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
