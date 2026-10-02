import type { ScheduleGame, UsageWeek } from "@sideline/shared";

export interface ResultMeta {
  source: string;
  /** Upstream asset timestamp (Last-Modified), or null when unknown. */
  assetUpdatedAt: string | null;
  fetchedAt: string;
  fromCache: boolean;
  warnings: string[];
}

export type ProviderFailure = "disabled" | "network" | "parse" | "not_found";

export type ProviderResult<T> =
  { ok: true; data: T; meta: ResultMeta } | { ok: false; reason: ProviderFailure; message: string };

export interface PlayerRef {
  playerId: string;
  fullName: string;
  team: string | null;
  position: string | null;
  gsisId: string | null;
}

export interface ScheduleProvider {
  getSchedule(season: number): Promise<ProviderResult<ScheduleGame[]>>;
}

export interface UsageProvider {
  getUsage(
    season: number,
    weeks: readonly number[] | undefined,
    players: readonly PlayerRef[],
  ): Promise<ProviderResult<UsageWeek[]>>;
}
