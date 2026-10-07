export const PACKAGE_NAME = "@sideline/providers";

export type { FetchFn } from "./cache.js";
export {
  cleanSummary,
  createMinIntervalLimiter,
  type EspnNewsItem,
  type EspnNewsOptions,
  fetchEspnPlayerNews,
  fetchEspnRecentNews,
  type MinIntervalLimiter,
} from "./espn-news.js";
export { parseCsvTable } from "./csv.js";
export {
  fetchKickoffForecast,
  type ForecastFailure,
  type ForecastResult,
  type KickoffForecast,
  precipTypeFromWmo,
} from "./open-meteo.js";
export {
  INTERNATIONAL_STADIUMS,
  type Roof,
  type StadiumLocation,
  stadiumLocation,
  TEAM_STADIUMS,
} from "./stadiums.js";
export { createNflverseProvider, type NflverseOptions } from "./nflverse.js";
export type { ScheduleGameRow } from "./schedule.js";
export { byeWeeks, impliedTotals, kickoffUtc, toSleeperTeam } from "./schedule.js";
export type {
  NflverseProvider,
  PlayerRef,
  ProviderFailure,
  ProviderResult,
  ResultMeta,
  ScheduleProvider,
  ScheduleWithDates,
  UsageProvider,
} from "./types.js";
export { joinUsage, normalizeName } from "./usage.js";
export { getPlayerIdCrosswalk, PLAYER_IDS_URL, type PlayerIdsOptions } from "./player-ids.js";
