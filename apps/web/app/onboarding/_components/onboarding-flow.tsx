"use client";

import type { LeagueChoice, OnboardingStatus } from "@sideline/shared";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState } from "../../../components/empty-state";
import { Button } from "../../../components/ui/button";
import {
  MAX_CONSECUTIVE_FAILURES,
  STATUS_POLL_DEADLINE_MS,
  isTerminalPhase,
  nextAfterSelect,
  nextFailureCount,
  pollDelay,
  pollShouldGiveUp,
  stepForPhase,
  syncSinceMs,
  type OnboardingStep,
} from "../../../lib/client/onboarding";
import { cn } from "../../../lib/client/cn";
import { apiJson } from "./api";
import { FirstSync } from "./first-sync";
import { UsernameForm } from "./username-form";

export interface OnboardingInitial {
  username: string | null;
  activeLeagueId: string | null;
  activeLeagueName: string | null;
  /** True when the active league already has stored data. */
  synced: boolean;
}

type View =
  | { kind: "username" }
  | { kind: "polling" }
  | { kind: "leagues"; leagues: LeagueChoice[] }
  | { kind: "failed"; message: string }
  | { kind: "offline" }
  | { kind: "sync"; leagueId: string; sinceMs: number | null }
  | { kind: "done" };

function initialView(i: OnboardingInitial): View {
  if (i.activeLeagueId !== null) {
    return i.synced
      ? { kind: "done" }
      : { kind: "sync", leagueId: i.activeLeagueId, sinceMs: null };
  }
  return i.username !== null ? { kind: "polling" } : { kind: "username" };
}

const GAVE_UP_MESSAGE =
  "Sideline couldn't finish setup. Check that the background worker is running, then try again.";

const TITLES: Record<View["kind"], string> = {
  username: "Find your leagues",
  polling: "Looking up your leagues",
  leagues: "Pick your league",
  failed: "That did not work",
  offline: "One more step",
  sync: "Getting your league ready",
  done: "You're set up",
};

/** Applies a server phase to the view. Returns null to keep the current one. */
function viewForStatus(s: OnboardingStatus): View {
  const step: OnboardingStep = stepForPhase(s.phase);
  if (step === "leagues" && s.phase === "ready") return { kind: "leagues", leagues: s.leagues };
  if (step === "failed" && s.phase === "failed") return { kind: "failed", message: s.error };
  if (step === "offline") return { kind: "offline" };
  if (step === "progress") return { kind: "polling" };
  return { kind: "username" };
}

export function OnboardingFlow({ initial }: { initial: OnboardingInitial }) {
  const [view, setView] = useState<View>(() => initialView(initial));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState(initial.username ?? "");
  const [phaseLabel, setPhaseLabel] = useState("Looking up your Sleeper account");
  const selectToken = useRef(0);
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step heading when the step changes.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view.kind]);

  // Poll onboarding status while a lookup is in flight.
  useEffect(() => {
    if (view.kind !== "polling") return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let failures = 0;
    const started = Date.now();
    const tick = async () => {
      const r = await apiJson("/api/onboarding/status", "OnboardingStatusSchema", {
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      failures = nextFailureCount(failures, r.ok);
      if (r.ok) {
        const s = r.data;
        setPhaseLabel(
          s.phase === "loading_leagues"
            ? "Finding your leagues"
            : "Looking up your Sleeper account",
        );
        if (isTerminalPhase(s.phase)) {
          setView(viewForStatus(s));
          return;
        }
      }
      if (
        pollShouldGiveUp({
          startedMs: started,
          nowMs: Date.now(),
          deadlineMs: STATUS_POLL_DEADLINE_MS,
          failures,
          maxFailures: MAX_CONSECUTIVE_FAILURES,
        })
      ) {
        setView({ kind: "failed", message: GAVE_UP_MESSAGE });
        return;
      }
      timer = setTimeout(() => void tick(), pollDelay(attempt++));
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [view.kind]);

  const submitUsername = useCallback(async (name: string) => {
    setPending(true);
    setError(null);
    setUsername(name);
    const r = await apiJson("/api/onboarding", "OnboardingStatusSchema", {
      method: "POST",
      body: { username: name },
    });
    setPending(false);
    if (!r.ok) {
      setError(
        r.status === 400
          ? "That doesn't look like a Sleeper username."
          : r.status === 503
            ? "The app isn't set up yet. Start the background worker with pnpm dev:worker, then try again."
            : r.message,
      );
      return;
    }
    setView(viewForStatus(r.data));
  }, []);

  const selectLeague = useCallback(
    async (leagueId: string) => {
      const token = ++selectToken.current;
      setPending(true);
      setError(null);
      const r = await apiJson("/api/onboarding/league", "SelectLeagueResponseSchema", {
        method: "POST",
        body: { leagueId },
      });
      if (token !== selectToken.current) return;
      setPending(false);
      if (!r.ok) {
        setError(r.status === 400 ? "That league isn't one of yours." : r.message);
        return;
      }
      if (nextAfterSelect(r.data.sync) === "home") {
        router.replace(`/l/${encodeURIComponent(leagueId)}`);
        return;
      }
      setView({ kind: "sync", leagueId, sinceMs: syncSinceMs(r.data.syncSince) });
    },
    [router],
  );

  const startOver = () => {
    selectToken.current++;
    setPending(false);
    setError(null);
    setView({ kind: "username" });
  };

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only" data-testid="onboarding-live">
        {view.kind === "polling" ? `${phaseLabel}...` : ""}
      </p>
      <section aria-labelledby="onboarding-step" data-testid={`onboarding-step-${view.kind}`}>
        <h2
          id="onboarding-step"
          ref={headingRef}
          tabIndex={-1}
          className="mb-4 text-lg font-semibold outline-none"
        >
          {TITLES[view.kind]}
        </h2>

        {view.kind === "username" ? (
          <UsernameForm
            initialValue={username}
            submitLabel="Find my leagues"
            pending={pending}
            error={error}
            onSubmit={(n) => void submitUsername(n)}
            testIdPrefix="onboarding"
            hint="The name you log in with on Sleeper. No password needed."
          />
        ) : null}

        {view.kind === "polling" ? (
          <div className="flex items-center gap-3" data-testid="onboarding-progress">
            <Loader2
              className="size-5 shrink-0 text-primary motion-safe:animate-spin"
              aria-hidden
            />
            <p
              aria-hidden
              className="text-sm text-muted-foreground"
              data-testid="onboarding-phase-status"
            >
              {phaseLabel}...
            </p>
          </div>
        ) : null}

        {view.kind === "offline" ? (
          <div data-testid="onboarding-worker-offline">
            <ErrorState
              title="The background worker isn't running"
              detail="Sideline needs it to fetch data from Sleeper. Start it from the project folder, then try again."
              className="px-0 py-4"
            />
            <p className="mb-4 text-center">
              <code className="rounded-[8px] bg-muted px-2 py-1 font-mono text-sm">
                pnpm dev:worker
              </code>
            </p>
            <Button
              className="w-full"
              onClick={() => {
                if (username) void submitUsername(username);
                else startOver();
              }}
              disabled={pending}
              data-testid="onboarding-retry"
            >
              Try again
            </Button>
          </div>
        ) : null}

        {view.kind === "failed" ? (
          <div className="flex flex-col gap-4" data-testid="onboarding-failed">
            <p role="alert" className="flex items-start gap-2 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
              <span data-testid="onboarding-error-message">{view.message}</span>
            </p>
            <Button onClick={startOver} data-testid="onboarding-retry">
              Try again
            </Button>
          </div>
        ) : null}

        {view.kind === "leagues" ? (
          <LeaguePicker
            leagues={view.leagues}
            pending={pending}
            error={error}
            onSelect={(id) => void selectLeague(id)}
            onBack={startOver}
          />
        ) : null}

        {view.kind === "sync" ? (
          <FirstSync leagueId={view.leagueId} sinceMs={view.sinceMs} onRetry={startOver} />
        ) : null}

        {view.kind === "done" ? (
          <div className="flex flex-col gap-4" data-testid="onboarding-done">
            <p className="text-sm text-muted-foreground">
              {initial.activeLeagueName
                ? `${initial.activeLeagueName} is ready.`
                : "Your league is ready."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  href={`/l/${encodeURIComponent(initial.activeLeagueId ?? "")}`}
                  data-testid="onboarding-go-home"
                >
                  Go to Home
                </Link>
              </Button>
              <Button variant="outline" onClick={startOver} data-testid="onboarding-start-over">
                Start over
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function LeaguePicker({
  leagues,
  pending,
  error,
  onSelect,
  onBack,
}: {
  leagues: LeagueChoice[];
  pending: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    leagues.length === 1 ? (leagues[0]?.leagueId ?? null) : null,
  );
  if (leagues.length === 0) {
    return (
      <div data-testid="onboarding-no-leagues">
        <EmptyState
          icon={Trophy}
          title="No leagues found for this season"
          message="Check the username, or try again after you join a league."
          className="px-0 py-4"
          action={<Button onClick={onBack}>Use a different username</Button>}
        />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onSelect(selected);
      }}
    >
      <fieldset className="flex flex-col gap-2" data-testid="onboarding-leagues">
        <legend className="sr-only">Leagues</legend>
        {leagues.map((l) => (
          <label
            key={l.leagueId}
            className={cn(
              "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-[12px] border bg-card px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
              selected === l.leagueId ? "border-primary" : "border-border",
            )}
            data-testid="onboarding-league-option"
          >
            <input
              type="radio"
              name="league"
              value={l.leagueId}
              checked={selected === l.leagueId}
              onChange={() => setSelected(l.leagueId)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.name}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {l.season} season, {l.totalRosters} teams
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border",
                selected === l.leagueId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {selected === l.leagueId ? <Check className="size-4" /> : null}
            </span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || selected === null}
        data-testid="onboarding-league-submit"
      >
        {pending ? "Working..." : "Use this league"}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
        Use a different username
      </Button>
    </form>
  );
}
