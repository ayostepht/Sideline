import { Trophy } from "lucide-react";
import { DataFreshness } from "../../../../../components/data-freshness";
import { DbError } from "../../../../../components/db-error";
import { EmptyState } from "../../../../../components/empty-state";
import { StaleBanner } from "../../../../../components/stale-banner";
import { leagueBase, parseWeek } from "../../../../../lib/client/nav";
import { getLeagueOverview, getStandings } from "../../../../../lib/server/league-views";
import { readPage } from "../../_components/load";
import { StandingsList } from "../../_components/standings";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const retryHref = `${leagueBase(leagueId)}/league`;
  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    standings: getStandings(h, leagueId, now),
  }));
  if (!read.ok || !read.value.overview.ok || !read.value.standings.ok) {
    return <DbError retryHref={retryHref} />;
  }
  const { overview, standings } = read.value;
  const week = parseWeek(sp.week) ?? overview.data.currentWeek;
  const rows = standings.data.rows;
  return (
    <div className="flex flex-col gap-3" data-testid="league-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">League</h1>
        <DataFreshness freshness={standings.data.freshness} now={read.now} className="mt-1" />
      </div>
      <StaleBanner freshness={standings.data.freshness} now={read.now} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No teams yet"
          message="Standings show up after the first sync."
        />
      ) : (
        <>
          <section aria-labelledby="league-standings-h" className="flex flex-col gap-1">
            <h2 id="league-standings-h" className="sl-label">
              Standings
            </h2>
            <StandingsList rows={rows} leagueId={leagueId} week={week} />
          </section>
        </>
      )}
    </div>
  );
}
