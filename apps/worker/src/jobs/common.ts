import {
  createDbEtagStore,
  readNflState,
  readNflStateFetchedAt,
  resolveIdentity,
  touchNflStateFetchedAt,
  upsertNflState,
} from "@sideline/db";
import type { NflState, SeasonType } from "@sideline/shared";
import { createDefaultSleeperClient, mapState, type SleeperClient } from "@sideline/sleeper";
import type { JobContext } from "../types.js";

/** Sent as `Sideline/<version> (self-hosted)`. Keep in step with the worker package version. */
export const SIDELINE_VERSION = "0.1.0";

/** Stored nfl_state older than this is refetched (the week rolls over on Tuesdays). */
export const STATE_MAX_AGE_MS = 60 * 60 * 1000;

/** Last regular-season week; weeks above it are never requested. */
export const MAX_REGULAR_WEEK = 18;

export interface SleeperJobDeps {
  /** Injected in tests; defaults to the global fetch (looked up at call time). */
  fetch?: typeof fetch;
}

export function makeClient(ctx: JobContext, deps: SleeperJobDeps): SleeperClient {
  return createDefaultSleeperClient({
    limiter: ctx.limiter,
    version: SIDELINE_VERSION,
    fetch: deps.fetch ?? ((...args) => fetch(...args)),
    etagStore: createDbEtagStore(ctx.db, () => ctx.now()),
    onWarning: (message, details) => ctx.logger.warn(details, message),
    onEvent: (e) => {
      if (e.type === "retry" || e.type === "error") ctx.logger.warn(e, "sleeper request problem");
    },
  });
}

/** Options for every Sleeper call: counts toward calls_made and aborts with the lease. */
export function callOpts(ctx: JobContext): { counter: JobContext["counter"]; signal: AbortSignal } {
  return { counter: ctx.counter, signal: ctx.signal };
}

/** Jobs call this before each request so a lost lease stops the job promptly. */
export function checkAbort(ctx: JobContext): void {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason instanceof Error ? ctx.signal.reason : new Error("job aborted");
  }
}

/** Persisted state; fetched (and stored) when missing or older than STATE_MAX_AGE_MS. */
export async function loadState(ctx: JobContext, client: SleeperClient): Promise<NflState> {
  const stored = readNflState(ctx.db);
  const fetchedAt = readNflStateFetchedAt(ctx.db);
  if (
    stored &&
    fetchedAt !== null &&
    ctx.now().getTime() - Date.parse(fetchedAt) < STATE_MAX_AGE_MS
  ) {
    return stored;
  }
  checkAbort(ctx);
  const res = await client.getState(callOpts(ctx));
  const state = mapState(res.data);
  storeState(ctx, state);
  return state;
}

/** Upserts the state and stamps the fetch time even when the values did not change. */
export function storeState(ctx: JobContext, state: NflState): { rowsChanged: number } {
  const at = ctx.now().toISOString();
  const out = upsertNflState(ctx.db, state, at);
  touchNflStateFetchedAt(ctx.db, at);
  return out;
}

export interface WeekCursor {
  season: number;
  /** 1 to 18. */
  week: number;
  seasonType: SeasonType;
}

/**
 * The regular-season week to sync. Preseason maps to week 1 (week 1 projections are published
 * early). Offseason and postseason return null: stats and projections jobs skip those.
 */
export function weekCursor(state: NflState): WeekCursor | null {
  if (state.seasonType === "off" || state.seasonType === "post") return null;
  return {
    season: state.season,
    week: Math.min(MAX_REGULAR_WEEK, Math.max(1, state.week)),
    seasonType: "regular",
  };
}

export const NO_LEAGUE_MESSAGE = "no league selected: finish onboarding or set DEFAULT_LEAGUE_ID";

/** Skip reasons already logged, per logger-less run context (one info line per run). */
const loggedSkip = new WeakSet<object>();

/**
 * The league to sync: the active league in app_settings (ADR-009), else DEFAULT_LEAGUE_ID, else
 * null. A null result logs the skip reason once per run (the run's counter identifies the run).
 */
export function requireLeagueId(ctx: JobContext): string | null {
  const id = resolveIdentity(ctx.db, { activeLeagueId: ctx.config.defaultLeagueId }).activeLeagueId;
  if (id !== null) return id;
  if (!loggedSkip.has(ctx.counter)) {
    loggedSkip.add(ctx.counter);
    ctx.logger.info(NO_LEAGUE_MESSAGE);
  }
  return null;
}
