import { claimNext, complete, reapStale, writeHeartbeat, type DbHandle } from "@sideline/db";
import {
  ONBOARDING_JOB_NAMES,
  OnboardingJobNameSchema,
  SYNC_JOB_NAMES,
  SyncJobNameSchema,
  type AppConfig,
  type SyncJobName,
} from "@sideline/shared";
import { userIdLookupUsername } from "./jobs/onboarding.js";
import type { SleeperJobDeps } from "./jobs/common.js";
import type { RateLimiter } from "@sideline/sleeper";
import type { Logger } from "pino";
import { LEASE_RENEW_MS, LEASE_RETRY_MS, type LeaseKeeper } from "./lease.js";
import type { JobRegistry } from "./registry.js";
import {
  ensureUserIdForCycle,
  runJobs,
  runOnboarding,
  summarizeFailures,
  type RunnerDeps,
} from "./runner.js";
import { buildCadences, dueJobs, type Cadences } from "./schedule.js";
import { isGameWindow, type GameKickoff } from "./windows.js";

export const HEARTBEAT_MS = 30_000;
export const POLL_MS = 5_000;
export const TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WorkerDeps {
  db: DbHandle;
  config: AppConfig;
  registry: JobRegistry;
  limiter: RateLimiter;
  logger: Logger;
  lease: LeaseKeeper;
  now: () => Date;
  /** Fetch for onboarding jobs (tests and fixture mode); defaults to the global fetch. */
  sleeper?: SleeperJobDeps;
  cadences?: Cadences;
  /** Kickoffs near `now`; default reads the `schedule` table (+/- 7 days). */
  loadGames?: (now: Date) => GameKickoff[];
}

/** Games within a week of `now` (the current week's schedule; may be empty). */
export function loadNearbyGames(db: DbHandle, now: Date): GameKickoff[] {
  const from = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const to = new Date(now.getTime() + 7 * DAY_MS).toISOString();
  const rows = db.sqlite
    .prepare(
      "SELECT kickoff_utc AS kickoffUtc FROM schedule WHERE kickoff_utc >= ? AND kickoff_utc <= ?",
    )
    .all(from, to) as GameKickoff[];
  return rows;
}

export class Worker {
  private busy = false;
  private current: Promise<unknown> | null = null;
  private stopped = false;
  private timers: NodeJS.Timeout[] = [];
  private readonly lastAttempt: Partial<Record<SyncJobName, Date>> = {};
  private readonly cadences: Cadences;

  constructor(private readonly d: WorkerDeps) {
    this.cadences = d.cadences ?? buildCadences(d.config.syncCron);
  }

  private runnerDeps(): RunnerDeps {
    return {
      db: this.d.db,
      limiter: this.d.limiter,
      logger: this.d.logger,
      config: this.d.config,
      now: this.d.now,
      signal: () => this.d.lease.signal,
    };
  }

  /** Try to take the lease; on success reap orphaned rows (safe: we hold the lease). */
  acquireTick(): boolean {
    if (this.stopped) return false;
    if (this.d.lease.held) return true;
    let got = false;
    try {
      got = this.d.lease.tryAcquire();
    } catch (e) {
      this.d.logger.error({ err: String(e) }, "lease acquire failed");
    }
    if (!got) {
      this.d.logger.info("sync lease held by another worker; retrying");
      return false;
    }
    // Reap only rows started before this acquisition, and not while our own job is winding down
    // after a lease loss (its rows are still ours).
    const acquiredAt = this.d.now();
    const reaped = this.busy ? { requests: 0, runs: 0 } : reapStale(this.d.db, acquiredAt, 0);
    this.d.logger.info({ holder: this.d.lease.holder, reaped }, "sync lease acquired");
    this.seedLastAttempts();
    this.heartbeatTick();
    return true;
  }

  /** Seeds last-attempt per job from the newest run of any status, so failures are not retried at once. */
  private seedLastAttempts(): void {
    const rows = this.d.db.sqlite
      .prepare("SELECT job, max(started_at) AS at FROM sync_runs GROUP BY job")
      .all() as { job: string; at: string | null }[];
    for (const r of rows) {
      const parsed = SyncJobNameSchema.safeParse(r.job);
      if (!parsed.success || r.at === null) continue;
      const t = Date.parse(r.at);
      if (!Number.isNaN(t) && this.lastAttempt[parsed.data] === undefined)
        this.lastAttempt[parsed.data] = new Date(t);
    }
  }

  renewTick(): boolean {
    if (!this.d.lease.held) return false;
    const ok = this.d.lease.renew();
    if (!ok) this.d.logger.error("sync lease lost; stopping work until re-acquired");
    return ok;
  }

  heartbeatTick(): void {
    if (!this.d.lease.held) return;
    try {
      writeHeartbeat(this.d.db, this.d.now(), { holder: this.d.lease.holder });
    } catch (e) {
      this.d.logger.error({ err: String(e) }, "heartbeat failed");
    }
  }

  /** Claims one manual request and runs it. Skips when busy or without the lease. */
  async pollTick(): Promise<void> {
    if (this.busy || this.stopped || !this.d.lease.held) return;
    let req;
    try {
      req = claimNext(this.d.db, this.d.now());
    } catch (e) {
      this.d.logger.error({ err: String(e) }, "claim failed");
      this.failUnknownJobs();
      return;
    }
    if (req === null) return;
    this.busy = true;
    const p = (async () => {
      try {
        let error: string | null;
        const onboarding = OnboardingJobNameSchema.safeParse(req.job);
        const parsed = SyncJobNameSchema.safeParse(req.job);
        if (req.paramsError !== undefined) {
          error = req.paramsError;
        } else if (onboarding.success) {
          error = (
            await runOnboarding(
              this.runnerDeps(),
              this.d.sleeper ?? {},
              onboarding.data,
              req.params ?? null,
            )
          ).error;
        } else if (req.job === "all" || parsed.success) {
          const names = parsed.success ? [parsed.data] : this.d.registry.allInOrder();
          if (req.job === "all") if (this.userIdMissing()) await this.ensureUserId();
          const outcomes = await runJobs(this.runnerDeps(), this.d.registry, names);
          error = summarizeFailures(outcomes);
        } else {
          error = `unknown job: ${String(req.job)}`;
        }
        if (error === null && this.d.lease.signal.aborted)
          error = "aborted (lease lost or shutdown)";
        complete(this.d.db, req.id, error === null ? "done" : "failed", error, this.d.now());
      } catch (e) {
        this.d.logger.error({ err: String(e) }, "request run failed");
        try {
          complete(this.d.db, req.id, "failed", String(e), this.d.now());
        } catch {
          // already logged
        }
      } finally {
        this.busy = false;
      }
    })();
    this.current = p;
    await p;
  }

  /**
   * claimNext throws on a request whose job is not a known name (the row stays pending and would
   * block the queue forever). Mark those failed so the queue moves on (review m7).
   */
  private failUnknownJobs(): void {
    const known = [...SYNC_JOB_NAMES, "all", ...ONBOARDING_JOB_NAMES];
    try {
      const marks = known.map(() => "?").join(",");
      const res = this.d.db.sqlite
        .prepare(
          `UPDATE sync_requests SET status = 'failed', error = 'unknown job', finished_at = ?
           WHERE status = 'pending' AND job NOT IN (${marks})`,
        )
        .run(this.d.now().toISOString(), ...known);
      if (res.changes > 0)
        this.d.logger.warn({ count: res.changes }, "failed requests with unknown job");
    } catch (e) {
      this.d.logger.error({ err: String(e) }, "could not fail unknown-job requests");
    }
  }

  /** Sync check so cycles with a stored id add no await (no scheduling yield). */
  private userIdMissing(): boolean {
    return userIdLookupUsername(this.d.db, this.d.config.sleeperUsername) !== null;
  }

  /** G2-B1: resolve a missing sleeper_user_id first. No await (no yield) when the id is stored. */
  private async ensureUserId(): Promise<void> {
    await ensureUserIdForCycle(this.runnerDeps(), this.d.sleeper ?? {});
  }

  /** Runs due scheduled jobs serially. */
  async scheduleTick(): Promise<void> {
    if (this.busy || this.stopped || !this.d.lease.held) return;
    const now = this.d.now();
    let games: GameKickoff[] = [];
    try {
      games = (this.d.loadGames ?? ((n) => loadNearbyGames(this.d.db, n)))(now);
    } catch (e) {
      this.d.logger.warn({ err: String(e) }, "could not read schedule; using fallback windows");
    }
    const due = dueJobs(now, this.lastAttempt, this.cadences, isGameWindow(now, games)).filter(
      (j) => this.d.registry.has(j),
    );
    if (due.length === 0) return;
    this.busy = true;
    const p = (async () => {
      try {
        if (this.userIdMissing()) await this.ensureUserId();
        for (const job of due) {
          if (this.d.lease.signal.aborted) break;
          this.lastAttempt[job] = this.d.now();
          await runJobs(this.runnerDeps(), this.d.registry, [job]);
        }
      } finally {
        this.busy = false;
      }
    })();
    this.current = p;
    await p;
  }

  /** Starts timers. The first acquisition attempt happens immediately. */
  start(): void {
    this.acquireTick();
    const every = (ms: number, fn: () => void | Promise<void>): void => {
      const t = setInterval(() => {
        Promise.resolve(fn()).catch((e: unknown) =>
          this.d.logger.error({ err: String(e) }, "tick failed"),
        );
      }, ms);
      this.timers.push(t);
    };
    every(LEASE_RETRY_MS, () => {
      if (!this.d.lease.held) this.acquireTick();
    });
    every(LEASE_RENEW_MS, () => {
      this.renewTick();
    });
    every(HEARTBEAT_MS, () => this.heartbeatTick());
    every(POLL_MS, () => this.pollTick());
    every(TICK_MS, () => this.scheduleTick());
  }

  /** Graceful shutdown: abort the current job, wait for it, release the lease. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.d.lease.abort("worker shutting down");
    if (this.current !== null) await this.current.catch(() => undefined);
    this.d.lease.release();
  }
}

/** Resolves when `p` settles or after `ms`, whichever is first; never rejects. */
export function raceTimeout(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    void p
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        clearTimeout(t);
        resolve();
      });
  });
}
