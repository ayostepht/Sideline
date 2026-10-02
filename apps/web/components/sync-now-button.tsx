"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiJson } from "../lib/client/api";
import { parseRetryAfter } from "../lib/client/onboarding";
import { Button } from "./ui/button";

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done" }
  | { kind: "limited"; seconds: number }
  | { kind: "error"; message: string };

/** Minutes to show for a rate limit wait, at least 1. */
export const waitMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

/** Seconds to wait from a Retry-After header, defaulting to 60 (the server debounce) when unusable. */
export function retryAfterSeconds(headers: Headers | null | undefined, nowMs: number): number {
  return parseRetryAfter(headers?.get("Retry-After") ?? null, nowMs) ?? 60;
}

/** Calls POST /api/sync/run and reports the outcome in a polite live region. */
export function SyncNowButton() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "done") return;
    const id = setTimeout(() => setState({ kind: "idle" }), 6000);
    return () => clearTimeout(id);
  }, [state.kind]);

  // Refresh server data a moment after a sync starts, so stale banners and content elsewhere on
  // the page clear once the worker has had a chance to pick up the job, instead of lingering
  // until the next unrelated navigation.
  useEffect(() => {
    if (state.kind !== "done") return;
    const id = setTimeout(() => router.refresh(), 2000);
    return () => clearTimeout(id);
  }, [state.kind, router]);

  async function run() {
    setState({ kind: "pending" });
    const r = await apiJson("/api/sync/run", "SyncRunResponseSchema", {
      method: "POST",
      body: { job: "all" },
    });
    if (r.ok) setState({ kind: "done" });
    else if (r.status === 429) {
      setState({ kind: "limited", seconds: retryAfterSeconds(r.headers, Date.now()) });
    } else setState({ kind: "error", message: r.message });
  }

  const message =
    state.kind === "done"
      ? "Sync started"
      : state.kind === "limited"
        ? `Try again in ${waitMinutes(state.seconds)} min`
        : state.kind === "error"
          ? state.message
          : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        onClick={() => void run()}
        disabled={state.kind === "pending"}
        data-testid="stale-banner-sync"
      >
        {state.kind === "pending" ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        {state.kind === "pending" ? "Syncing..." : "Sync now"}
      </Button>
      <span role="status" className="text-sm" data-testid="stale-banner-sync-message">
        {message}
      </span>
    </div>
  );
}
