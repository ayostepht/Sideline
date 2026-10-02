import { Cron } from "croner";
import { SYNC_CADENCE_MS, type SyncJobName } from "@sideline/shared";
import { ALL_ORDER } from "./registry.js";
import { NFL_TZ } from "./windows.js";

const MIN = 60_000;

export type Cadence = { every: number; inWindowEvery?: number } | { cron: string };
export type Cadences = Partial<Record<SyncJobName, Cadence | undefined>>;

/** PLAN 3.1 defaults. Cron expressions are evaluated in America/New_York. */
function everyOf(job: SyncJobName): number {
  const ms = SYNC_CADENCE_MS[job];
  if (ms === null) throw new Error(`no interval cadence for ${job}`);
  return ms;
}

export const DEFAULT_CADENCES: Cadences = {
  state: { every: everyOf("state") },
  league: { every: everyOf("league") },
  users: { every: everyOf("users") },
  rosters: { every: everyOf("rosters"), inWindowEvery: 5 * MIN },
  matchups: { every: everyOf("matchups"), inWindowEvery: 2 * MIN },
  transactions: { every: everyOf("transactions") },
  players: { cron: "30 4 * * *" },
  trending: { every: everyOf("trending") },
  stats: { every: everyOf("stats") },
  projections: { every: everyOf("projections") },
  nflverse: { cron: "0 5 * * *" },
};

/** Applies `config.syncCron` overrides (cron expressions replace the default cadence). */
export function buildCadences(overrides: Partial<Record<string, string>>): Cadences {
  const out: Cadences = { ...DEFAULT_CADENCES };
  for (const job of ALL_ORDER) {
    const expr = overrides[job];
    if (expr !== undefined && expr !== "") out[job] = { cron: expr };
  }
  return out;
}

/** Jobs due at `now`, in run order. A job that never ran is due. Pure. */
export function dueJobs(
  now: Date,
  lastRunByJob: Partial<Record<SyncJobName, Date>>,
  cadences: Cadences,
  inWindow: boolean,
): SyncJobName[] {
  const due: SyncJobName[] = [];
  for (const job of ALL_ORDER) {
    const cadence = cadences[job];
    if (cadence === undefined) continue;
    const last = lastRunByJob[job];
    if (last === undefined) {
      due.push(job);
      continue;
    }
    if ("cron" in cadence) {
      const next = new Cron(cadence.cron, { timezone: NFL_TZ }).nextRun(last);
      if (next !== null && next.getTime() <= now.getTime()) due.push(job);
    } else {
      const every =
        inWindow && cadence.inWindowEvery !== undefined ? cadence.inWindowEvery : cadence.every;
      if (now.getTime() - last.getTime() >= every) due.push(job);
    }
  }
  return due;
}
