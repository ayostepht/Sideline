import type { Job } from "../types.js";
import type { SleeperJobDeps } from "./common.js";
import { backfillJob, playersJob, projectionsJob, statsJob, trendingJob } from "./data-jobs.js";
import { nflverseJob, type NflverseJobDeps } from "./nflverse-job.js";
import {
  leagueJob,
  matchupsJob,
  rostersJob,
  stateJob,
  transactionsJob,
  usersJob,
} from "./league-jobs.js";

/**
 * All Sleeper jobs (T1.5b). `deps.fetch` is for tests; production uses the global fetch.
 * `nflverseDeps` is passed through only to `backfill_2025`, which also backfills the 2025
 * nflverse schedule (G3-FIX-2); the recurring `nflverse` job is registered separately below.
 */
export function createSleeperJobs(
  deps: SleeperJobDeps = {},
  nflverseDeps: NflverseJobDeps = {},
): Job[] {
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
    backfillJob(deps, nflverseDeps),
  ];
}

/**
 * Registration point: the worker and the CLI both build their registry from this list.
 *
 */
export const registeredJobs: Job[] = [...createSleeperJobs(), nflverseJob()];

/** Every job, with injected fetches (tests and db:seed:fixtures). */
export function createAllJobs(deps: {
  sleeper?: SleeperJobDeps;
  nflverse?: NflverseJobDeps;
}): Job[] {
  return [
    ...createSleeperJobs(deps.sleeper ?? {}, deps.nflverse ?? {}),
    nflverseJob(deps.nflverse ?? {}),
  ];
}
