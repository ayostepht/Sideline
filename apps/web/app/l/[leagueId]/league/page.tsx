import { Trophy } from "lucide-react";
import Link from "next/link";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getStandings } from "../../../../lib/server/league-views";
import { formatRecord } from "../_components/format";
import { readPage } from "../_components/load";
import { StandingsList } from "../_components/standings";

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
  const weekQs = week === null ? "" : `?week=${week}`;
  return (
    <div className="flex flex-col gap-4" data-testid="league-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">League</h1>
        <DataFreshness freshness={standings.data.freshness} now={read.now} className="mt-1" />
      </div>
      <StaleBanner freshness={standings.data.freshness} now={read.now} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No teams yet"
          message="Standings and rosters show up after the first sync."
        />
      ) : (
        <>
          <section aria-labelledby="league-standings-h" className="flex flex-col gap-2">
            <h2 id="league-standings-h" className="text-base font-semibold">
              Standings
            </h2>
            <StandingsList rows={rows} leagueId={leagueId} week={week} />
          </section>
          <section aria-labelledby="league-rosters-h" className="flex flex-col gap-2">
            <h2 id="league-rosters-h" className="text-base font-semibold">
              Rosters
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="league-rosters">
              {[...rows]
                .sort((a, b) => a.rosterId - b.rosterId)
                .map((r) => (
                  <li key={r.rosterId}>
                    <Link
                      href={`${leagueBase(leagueId)}/league/teams/${r.rosterId}${weekQs}`}
                      data-testid="league-roster-link"
                      className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] border bg-card px-3 py-3 text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 truncate font-medium">{r.teamName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatRecord(r)}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
