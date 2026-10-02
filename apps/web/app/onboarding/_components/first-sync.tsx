"use client";

import type { SyncStatusResponse } from "@sideline/shared";
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FIRST_SYNC_JOBS,
  firstSyncProgress,
  type FirstSyncJob,
  type FirstSyncState,
} from "../../../lib/client/onboarding";
import { apiJson } from "./api";

const LABELS: Record<FirstSyncJob, string> = {
  league: "League settings",
  users: "Managers",
  rosters: "Rosters",
};
const STATE_TEXT: Record<FirstSyncState, string> = {
  done: "Done",
  running: "Syncing",
  failed: "Failed",
  waiting: "Waiting",
};
const TIMEOUT_MS = 120_000;
const POLL_MS = 2000;

function StateIcon({ state }: { state: FirstSyncState }) {
  if (state === "done") return <CheckCircle2 className="size-5 text-positive" aria-hidden />;
  if (state === "failed") return <AlertCircle className="size-5 text-negative" aria-hidden />;
  if (state === "running")
    return <Loader2 className="size-5 text-primary motion-safe:animate-spin" aria-hidden />;
  return <Circle className="size-5 text-muted-foreground" aria-hidden />;
}

/** Polls sync status until the league jobs finish after `sinceMs`, then opens Home. */
export function FirstSync({ leagueId, sinceMs }: { leagueId: string; sinceMs: number | null }) {
  const router = useRouter();
  const homeHref = `/l/${encodeURIComponent(leagueId)}`;
  const [jobs, setJobs] = useState<SyncStatusResponse["jobs"]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const navigated = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await apiJson<SyncStatusResponse>("/api/sync/status", { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setFetchFailed(!r.ok);
      if (r.ok) {
        setJobs(r.data.jobs);
        if (firstSyncProgress(r.data.jobs, sinceMs).allDone) {
          if (!navigated.current) {
            navigated.current = true;
            router.replace(homeHref);
          }
          return;
        }
      }
      if (Date.now() - started >= TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [homeHref, router, sinceMs]);

  const { states, allDone } = firstSyncProgress(jobs, sinceMs);
  return (
    <div className="flex flex-col gap-4" data-testid="onboarding-sync">
      <ul className="flex flex-col gap-1" data-testid="onboarding-sync-jobs">
        {FIRST_SYNC_JOBS.map((job) => (
          <li
            key={job}
            className="flex min-h-11 items-center gap-3 border-b border-border last:border-b-0"
            data-testid={`onboarding-sync-job-${job}`}
            data-state={states[job]}
          >
            <StateIcon state={states[job]} />
            <span className="flex-1 text-sm">{LABELS[job]}</span>
            <span className="text-sm text-muted-foreground">{STATE_TEXT[states[job]]}</span>
          </li>
        ))}
      </ul>
      <p
        aria-live="polite"
        className="text-sm text-muted-foreground"
        data-testid="onboarding-phase-status"
      >
        {allDone
          ? "All set. Opening your league."
          : timedOut
            ? "This is taking longer than usual. The sync keeps running in the background."
            : fetchFailed
              ? "Can't check progress right now. Trying again."
              : "Pulling in your league. This can take a minute the first time."}
      </p>
      {timedOut ? (
        <Link
          href={homeHref}
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary underline underline-offset-4"
          data-testid="onboarding-go-home"
        >
          Go to Home anyway
        </Link>
      ) : null}
    </div>
  );
}
