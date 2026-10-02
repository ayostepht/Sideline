import type { SyncJobName } from "@sideline/shared";
import type { Job } from "./types.js";

/** Order used for `all`. `nflverse` precedes `projections`: pregame snapshots need kickoffs. `backfill_2025` runs only when requested explicitly. */
export const ALL_ORDER: readonly SyncJobName[] = [
  "state",
  "league",
  "users",
  "rosters",
  "matchups",
  "transactions",
  "players",
  "trending",
  "stats",
  "nflverse",
  "projections",
];

export interface JobRegistry {
  get(name: SyncJobName): Job | undefined;
  has(name: SyncJobName): boolean;
  names(): SyncJobName[];
  /** Registered jobs for `all`, in the defined order. */
  allInOrder(): SyncJobName[];
}

export function createJobRegistry(jobs: readonly Job[]): JobRegistry {
  const map = new Map<SyncJobName, Job>();
  for (const job of jobs) {
    if (map.has(job.name)) throw new Error(`duplicate job registration: ${job.name}`);
    map.set(job.name, job);
  }
  return {
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    names: () => [...map.keys()],
    allInOrder: () => ALL_ORDER.filter((n) => map.has(n)),
  };
}
