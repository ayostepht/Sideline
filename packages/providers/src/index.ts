export const PACKAGE_NAME = "@sideline/providers";

export type { FetchFn } from "./cache.js";
export { parseCsvTable } from "./csv.js";
export { createNflverseProvider, type NflverseOptions } from "./nflverse.js";
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
