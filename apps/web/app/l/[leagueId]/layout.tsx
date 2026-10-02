import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorState } from "../../../components/empty-state";
import { AppShell } from "../../../components/shell/app-shell";
import { getDb } from "../../../lib/server/db";
import { getLeagueChoices } from "../../../lib/server/identity";
import { getLeagueOverview } from "../../../lib/server/league-views";

export const dynamic = "force-dynamic";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const db = getDb();
  if (!db.ok) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <ErrorState
          title="Sideline can't reach its database"
          detail="Check that the data folder is mounted and the app has run its migrations."
          retryHref={`/l/${encodeURIComponent(leagueId)}`}
        />
      </main>
    );
  }
  const overview = getLeagueOverview(db.handle, leagueId, new Date());
  if (!overview.ok) notFound();
  const leagues = getLeagueChoices(db.handle);
  return (
    <AppShell
      leagueId={overview.data.leagueId}
      leagueName={overview.data.name}
      currentWeek={overview.data.currentWeek}
      leagues={leagues}
    >
      {children}
    </AppShell>
  );
}
