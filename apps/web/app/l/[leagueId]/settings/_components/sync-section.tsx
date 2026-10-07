"use client";

import type { SyncJobStatus, SyncStatusResponse } from "@sideline/shared";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatAge } from "../../../../../components/freshness";
import { ErrorState } from "../../../../../components/empty-state";
import { Button } from "../../../../../components/ui/button";
import { Tooltip } from "../../../../../components/ui/tooltip";
import { SETTINGS_POLL_DEADLINE_MS, parseRetryAfter } from "../../../../../lib/client/onboarding";
import { apiJson } from "../../../../../lib/client/api";

const JOB_LABELS: Record<string, string> = {
  state: "NFL week and season",
  league: "League settings",
  users: "Managers",
  rosters: "Rosters",
  matchups: "Matchups",
  transactions: "Trades and waivers",
  players: "Player list",
  trending: "Trending adds",
  stats: "Player stats",
  projections: "Projections",
  backfill_2025: "Last season history",
  nflverse: "Extra NFL data",
  player_ids: "Player ID links",
};

type JobState = "running" | "failed" | "never" | "stale" | "ok";

function jobState(j: SyncJobStatus): JobState {
  if (j.lastRun?.status === "running") return "running";
  if (j.lastRun?.status === "failed") return "failed";
  if (j.lastSuccessAt === null) return "never";
  return j.stale ? "stale" : "ok";
}

/** One status per job: icon plus text. */
function JobStatus({ state }: { state: JobState }) {
  switch (state) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <Loader2 className="size-3.5 text-foreground motion-safe:animate-spin" aria-hidden />{" "}
          Running
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <AlertCircle className="size-3.5 text-negative" aria-hidden /> Failed
        </span>
      );
    case "never":
      return <span className="text-xs text-muted-foreground">Not run yet</span>;
    case "stale":
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <AlertTriangle className="size-3.5 text-warning" aria-hidden /> Out of date
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <CheckCircle2 className="size-3.5 text-positive" aria-hidden /> Up to date
        </span>
      );
  }
}

/** "11 of 12 data sources are current. Last sync 1 day ago." */
export function syncSummary(jobs: readonly SyncJobStatus[], now: number): string {
  if (jobs.length === 0) return "No sync data yet.";
  // A running job only counts as up to date if it has a prior success; a job that is running
  // for the very first time has no data to show yet, so it should not count.
  const upToDate = jobs.filter(
    (j) => jobState(j) === "ok" || (jobState(j) === "running" && j.lastSuccessAt !== null),
  ).length;
  const times = jobs
    .map((j) => (j.lastSuccessAt === null ? Number.NaN : Date.parse(j.lastSuccessAt)))
    .filter((t) => !Number.isNaN(t));
  const latest = times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
  const last = latest === null ? "No sync yet." : `Last sync ${formatAge(latest, now)}.`;
  return `${upToDate} of ${jobs.length} data sources are current. ${last}`;
}

export function SyncSection() {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await apiJson(
      "/api/sync/status",
      "SyncStatusResponseSchema",
      signal ? { signal } : {},
    );
    if (signal?.aborted) return;
    if (r.ok) {
      setData(r.data);
      setLoadError(false);
      setNow(Date.now());
    } else setLoadError(true);
  }, []);

  const busy =
    data !== null &&
    (data.pending.length > 0 || data.jobs.some((j) => j.lastRun?.status === "running"));

  // Load on mount; keep refreshing every 3 s while a sync is queued or running.
  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    if (!busy) return () => ctrl.abort();
    // Poll every 3 s, but not while the tab is hidden, and give up after 5 minutes.
    const started = Date.now();
    let id: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (id !== undefined) clearInterval(id);
      id = undefined;
    };
    const start = () => {
      stop();
      id = setInterval(() => {
        if (Date.now() - started >= SETTINGS_POLL_DEADLINE_MS) stop();
        else void load(ctrl.signal);
      }, 3000);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (Date.now() - started < SETTINGS_POLL_DEADLINE_MS) {
        void load(ctrl.signal);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ctrl.abort();
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, busy]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  async function syncNow() {
    setPending(true);
    setMessage(null);
    const r = await apiJson("/api/sync/run", "SyncRunResponseSchema", {
      method: "POST",
      body: { job: "all" },
    });
    setPending(false);
    if (r.ok) {
      setMessage(r.data.deduplicated ? "A sync is already queued." : "Sync queued.");
      void load();
    } else if (r.status === 429) {
      const secs = parseRetryAfter(r.headers?.get("Retry-After") ?? null, Date.now()) ?? 30;
      setRetryIn(secs);
      setMessage(null);
    } else {
      setMessage(r.message);
    }
  }

  const disabled = pending || retryIn > 0;
  return (
    <div className="flex flex-col gap-3" data-testid="settings-sync">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void syncNow()} disabled={disabled} data-testid="settings-sync-now">
          <RefreshCw className="size-4" aria-hidden /> {pending ? "Queueing..." : "Sync now"}
        </Button>
        <p
          role="status"
          className="text-sm text-muted-foreground"
          data-testid="settings-sync-message"
        >
          {retryIn > 0
            ? "Sync is rate limited. Try again soon."
            : (message ?? (busy ? "Sync in progress." : ""))}
        </p>
        {retryIn > 0 ? (
          <span aria-hidden className="text-sm tabular-nums text-muted-foreground">
            {retryIn}s
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground" data-testid="settings-sync-cooldown">
        You can sync again about a minute after the last run.
      </p>
      {loadError && data === null ? (
        <ErrorState
          title="Couldn't load sync status"
          onRetry={() => void load()}
          className="py-6"
        />
      ) : data === null ? (
        <div className="flex flex-col gap-2" aria-hidden data-testid="settings-sync-loading">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sl-skeleton h-11" />
          ))}
        </div>
      ) : (
        <>
          {loadError ? (
            <p role="status" className="text-sm text-warning">
              Couldn't refresh. Showing the last result.
            </p>
          ) : null}
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium tabular-nums" data-testid="settings-sync-summary">
              {syncSummary(data.jobs, now)}
            </p>
            <Tooltip content="Each part of your league data, like rosters or player stats, syncs on its own.">
              <button
                type="button"
                aria-label="What is a data source?"
                data-testid="settings-sync-info"
                className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
              >
                <Info className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
          <details data-testid="settings-sync-details">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-link">
              Details
            </summary>
            <ul className="flex flex-col" data-testid="settings-sync-jobs">
              {data.jobs.map((j) => (
                <li
                  key={j.job}
                  className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0"
                  data-testid="settings-sync-job"
                  data-job={j.job}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {JOB_LABELS[j.job] ?? j.job}
                    </span>
                    <JobStatus state={jobState(j)} />
                  </div>
                  {j.lastSuccessAt !== null ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Updated {formatAge(j.lastSuccessAt, now)}
                    </span>
                  ) : null}
                  {j.lastRun?.error ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="flex min-h-11 cursor-pointer items-center">
                        Last error
                      </summary>
                      <p className="break-words pb-2">{j.lastRun.error.slice(0, 200)}</p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
