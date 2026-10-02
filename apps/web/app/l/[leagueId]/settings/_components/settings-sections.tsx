"use client";

import type { LeagueChoice, OnboardingStatus } from "@sideline/shared";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { apiJson } from "../../../../onboarding/_components/api";
import { UsernameForm } from "../../../../onboarding/_components/username-form";
import dynamic from "next/dynamic";

const ThemeToggle = dynamic(
  () => import("../../../../../components/theme-toggle").then((m) => m.ThemeToggle),
  { loading: () => <div className="sl-skeleton h-11 w-64 max-w-full" aria-hidden /> },
);

// Sync controls load after first paint to keep the first-load bundle small.
const SyncSection = dynamic(() => import("./sync-section").then((m) => m.SyncSection), {
  loading: () => (
    <div className="flex flex-col gap-2" aria-hidden data-testid="settings-sync-loading">
      <div className="sl-skeleton h-11" />
      <div className="sl-skeleton h-11" />
      <div className="sl-skeleton h-11" />
    </div>
  ),
});

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card data-testid={testId}>
      <section aria-labelledby={id}>
        <CardHeader>
          <CardTitle id={id} className="text-base">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </section>
    </Card>
  );
}

export function SettingsSections({
  leagueId,
  leagueName,
  username,
  leagues,
  version,
}: {
  leagueId: string;
  leagueName: string;
  username: string | null;
  leagues: LeagueChoice[];
  version: string;
}) {
  const router = useRouter();
  const [acctPending, setAcctPending] = useState(false);
  const [acctError, setAcctError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const selectId = useId();
  const others = leagues.filter((l) => l.leagueId !== leagueId);

  async function changeUsername(name: string) {
    setAcctPending(true);
    setAcctError(null);
    const r = await apiJson<{ onboarding: OnboardingStatus | null }>("/api/settings", {
      method: "PATCH",
      body: { username: name },
    });
    setAcctPending(false);
    if (!r.ok) {
      setAcctError(r.status === 400 ? "That doesn't look like a Sleeper username." : r.message);
      return;
    }
    if (r.data.onboarding?.phase === "worker_offline") {
      setAcctError(
        "The background worker isn't running. Start it with pnpm dev:worker, then try again.",
      );
      return;
    }
    router.push("/onboarding");
  }

  async function switchLeague() {
    if (target === "") return;
    setSwitching(true);
    setSwitchError(null);
    const r = await apiJson<unknown>("/api/settings", {
      method: "PATCH",
      body: { leagueId: target },
    });
    setSwitching(false);
    if (!r.ok) {
      setSwitchError(r.message);
      return;
    }
    router.push(`/l/${encodeURIComponent(target)}/settings`);
  }

  return (
    <>
      <Section title="Account" testId="settings-account">
        <p className="mb-3 text-sm text-muted-foreground">
          Sleeper username:{" "}
          <span className="font-medium text-foreground" data-testid="settings-username">
            {username ?? "not set"}
          </span>
        </p>
        <UsernameForm
          initialValue={username ?? ""}
          submitLabel="Change"
          pending={acctPending}
          error={acctError}
          onSubmit={(n) => void changeUsername(n)}
          testIdPrefix="settings"
          label="Change username"
          hint="Changing it restarts setup so you can pick a league again."
        />
      </Section>

      <Section title="League" testId="settings-league">
        <p className="text-sm text-muted-foreground">
          Current league:{" "}
          <span className="font-medium text-foreground" data-testid="settings-league-name">
            {leagueName}
          </span>
        </p>
        {others.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            <label htmlFor={selectId} className="text-sm font-medium">
              Switch league
            </label>
            <select
              id={selectId}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-input bg-card px-3 text-base text-foreground"
              data-testid="settings-league-select"
            >
              <option value="">Choose a league</option>
              {others.map((l) => (
                <option key={l.leagueId} value={l.leagueId}>
                  {l.name} ({l.season})
                </option>
              ))}
            </select>
            {switchError ? (
              <p role="alert" className="text-sm text-negative">
                {switchError}
              </p>
            ) : null}
            <Button
              onClick={() => void switchLeague()}
              disabled={target === "" || switching}
              data-testid="settings-league-switch"
            >
              {switching ? "Switching..." : "Switch"}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No other leagues found for this season.
          </p>
        )}
      </Section>

      <Section title="Appearance" testId="settings-appearance">
        <ThemeToggle />
      </Section>

      <Section title="Data sync" testId="settings-data-sync">
        <SyncSection />
      </Section>

      <Section title="About" testId="settings-about">
        <p className="text-sm">
          Sideline{" "}
          <span className="tabular-nums" data-testid="settings-version">
            v{version}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Self-hosting help lives in docs/self-hosting.md in the project folder.
        </p>
      </Section>
    </>
  );
}
