"use client";

import type { SyncJobStatus, SyncRunResponse, SyncStatusResponse } from "@sideline/shared";
import { AlertCircle, CheckCircle2, Circle, Loader2, MinusCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DataFreshness } from "../../../../../components/data-freshness";
import { ErrorState } from "../../../../../components/empty-state";
import { Button } from "../../../../../components/ui/button";
import { parseRetryAfter } from "../../../../../lib/client/onboarding";
import { apiJson } from "../../../../onboarding/_components/api";

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
};

function RunStatus({ run }: { run: SyncJobStatus["lastRun"] }) {
  if (run === null)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Circle className="size-3.5" aria-hidden /> Never run
      </span>
    );
  if (run.status === "success")
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <CheckCircle2 className="size-3.5 text-positive" aria-hidden /> OK
      </span>
    );
  if (run.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <AlertCircle className="size-3.5 text-negative" aria-hidden /> Failed
      </span>
    );
  if (run.status === "running")
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <Loader2 className="size-3.5 text-primary motion-safe:animate-spin" aria-hidden /> Running
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MinusCircle className="size-3.5" aria-hidden /> Skipped
    </span>
  );
}

export function SyncSection() {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await apiJson<SyncStatusResponse>("/api/sync/status", signal ? { signal } : {});
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
    const id = setInterval(() => void load(ctrl.signal), 3000);
    return () => {
      ctrl.abort();
      clearInterval(id);
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
    const r = await apiJson<SyncRunResponse>("/api/sync/run", {
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
            ? `You can sync again in ${retryIn}s.`
            : (message ?? (busy ? "Sync in progress." : ""))}
        </p>
      </div>
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
                  <RunStatus run={j.lastRun} />
                </div>
                <DataFreshness
                  freshness={{ updatedAt: j.lastSuccessAt, stale: j.stale }}
                  now={now}
                />
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
        </>
      )}
    </div>
  );
}
