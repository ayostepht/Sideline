/**
 * Timestamp conventions in these contracts:
 * - ISO 8601 strings: `fetchedAt` (stats, trending), `kickoffUtc`, `seasonStartDate` (date only),
 *   sync `startedAt`/`finishedAt`/`requestedAt`, health `time`, `lastHeartbeatAt`, `lastSuccessAt`.
 * - ms epoch numbers: Transaction `createdAt` and `statusUpdatedAt`, plus the heartbeat input of
 *   `deriveWorkerStatus` (api/health).
 */
export const PACKAGE_NAME = "@sideline/shared";

export * from "./domain/nfl-state.js";
export * from "./domain/league.js";
export * from "./domain/roster.js";
export * from "./domain/player.js";
export * from "./domain/matchup.js";
export * from "./domain/transaction.js";
export * from "./domain/stats.js";
export * from "./domain/schedule.js";
export * from "./domain/usage.js";
export * from "./domain/trending.js";
export * from "./sync.js";
export * from "./reason.js";
export * from "./api/health.js";
export * from "./api/sync.js";
export * from "./config.js";
export * from "./api/freshness.js";
export * from "./api/onboarding.js";
export * from "./api/league.js";
export * from "./api/lineup.js";
export * from "./api/waiver.js";
