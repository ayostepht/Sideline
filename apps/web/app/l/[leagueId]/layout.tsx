import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DbError } from "../../../components/db-error";
import { AppShell } from "../../../components/shell/app-shell";
import { SyncingState } from "../../../components/shell/syncing-state";
import { getDb } from "../../../lib/server/db";
import { gameNow } from "../../../lib/server/game-clock";
import { getIdentity, getLeagueChoices } from "../../../lib/server/identity";
import { getLeagueOverview } from "../../../lib/server/league-views";

export const dynamic = "force-dynamic";

export default async function LeagueLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode;
  /** Parallel slot: the player pop-up (intercepting route). Null when closed. */
  modal: ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const retryHref = `/l/${encodeURIComponent(leagueId)}`;
  let state;
  try {
    const db = getDb();
    if (!db.ok) return <DbError retryHref={retryHref} />;
    const overview = getLeagueOverview(db.handle, leagueId, gameNow());
    if (!overview.ok) {
      if (getIdentity(db.handle).activeLeagueId === leagueId) return <SyncingState />;
      notFound();
    }
    state = { overview: overview.data, leagues: getLeagueChoices(db.handle) };
  } catch (err) {
    // notFound() throws a control-flow error that must pass through.
    if (isNextControlFlow(err)) throw err;
    return <DbError retryHref={retryHref} />;
  }
  return (
    <AppShell
      leagueId={state.overview.leagueId}
      leagueName={state.overview.name}
      currentWeek={state.overview.currentWeek}
      leagues={state.leagues}
    >
      {children}
      {modal}
    </AppShell>
  );
}

function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
