import type { Job } from "../types.js";

/**
 * Registration point: T1.5b (Sleeper jobs) and T1.5c (nflverse) append their jobs here.
 * The worker and the CLI both build their registry from this list.
 */
export const registeredJobs: Job[] = [];
