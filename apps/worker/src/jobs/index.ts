import type { Job } from "../types.js";
import type { SleeperJobDeps } from "./common.js";
import { backfillJob, playersJob, projectionsJob, statsJob, trendingJob } from "./data-jobs.js";
import {
  leagueJob,
  matchupsJob,
  rostersJob,
  stateJob,
  transactionsJob,
  usersJob,
} from "./league-jobs.js";

/** All Sleeper jobs (T1.5b). `deps.fetch` is for tests; production uses the global fetch. */
export function createSleeperJobs(deps: SleeperJobDeps = {}): Job[] {
  return [
    stateJob(deps),
    leagueJob(deps),
    usersJob(deps),
    rostersJob(deps),
    matchupsJob(deps),
    transactionsJob(deps),
    playersJob(deps),
    trendingJob(deps),
    statsJob(deps),
    projectionsJob(deps),
    backfillJob(deps),
  ];
}

/**
 * Registration point: the worker and the CLI both build their registry from this list.
 * T1.5c (nflverse) appends its job here.
 */
export const registeredJobs: Job[] = [...createSleeperJobs()];
