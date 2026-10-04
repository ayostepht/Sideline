import { Trophy } from "lucide-react";
import { DataFreshness } from "../../../../../components/data-freshness";
import { DbError } from "../../../../../components/db-error";
import { EmptyState } from "../../../../../components/empty-state";
import { PositionalStrengthGrid } from "../../../../../components/positional-strength-grid";
import { StaleBanner } from "../../../../../components/stale-banner";
import { leagueBase, parseWeek } from "../../../../../lib/client/nav";
import { getLeagueIntelligence } from "../../../../../lib/server/league-intelligence";
import { getLeagueOverview, getStandings } from "../../../../../lib/server/league-views";
import { readPage } from "../../_components/load";
import { SeasonStateNotice, seasonStateFor } from "../../_components/season-state-notice";
import { StandingsList } from "../../_components/standings";
import { AllPlayLuckList } from "../_components/all-play-luck";
import { ManagerTendenciesList } from "../_components/manager-tendencies";
import { PlayoffOddsSection } from "../_components/playoff-odds";
import { PowerRankingsList } from "../_components/power-rankings";

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
    intelligence: getLeagueIntelligence(h, leagueId, now),
  }));
  if (
    !read.ok ||
    !read.value.overview.ok ||
    !read.value.standings.ok ||
    !read.value.intelligence.ok
  ) {
    return <DbError retryHref={retryHref} />;
  }
  const { overview, standings, intelligence } = read.value;
  const week = parseWeek(sp.week) ?? overview.data.currentWeek;
  const rows = standings.data.rows;

  // Preseason: no season data exists yet, so there is nothing below worth showing. Offseason
  // keeps the final season's standings and sections visible (a banner only, see below) since
  // that retrospective is still useful once the season has ended.
  if (seasonStateFor(overview.data.status) === "preseason") {
    return (
      <div className="flex flex-col gap-3" data-testid="league-page">
        <h1 className="text-2xl font-semibold tracking-tight">League</h1>
        <SeasonStateNotice
          status={overview.data.status}
          testid="league"
          preseasonMessage="The season has not started. Standings and team insights begin once the first NFL week opens."
          offseasonMessage="The season is over. Standings and team insights will be back when the new season starts."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="league-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">League</h1>
        <DataFreshness freshness={standings.data.freshness} now={read.now} className="mt-1" />
      </div>
      <StaleBanner freshness={standings.data.freshness} now={read.now} />
      <SeasonStateNotice
        status={overview.data.status}
        testid="league"
        preseasonMessage="The season has not started. Standings and team insights begin once the first NFL week opens."
        offseasonMessage="The season is over. Standings and team insights will be back when the new season starts."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No teams yet"
          message="Standings show up after the first sync."
        />
      ) : (
        <>
          <section aria-labelledby="league-standings-h" className="flex flex-col gap-1">
            <h2 id="league-standings-h" className="sl-label sl-mark">
              Standings
            </h2>
            <StandingsList rows={rows} leagueId={leagueId} week={week} />
          </section>

          <section aria-labelledby="league-power-h" className="flex flex-col gap-1">
            <h2 id="league-power-h" className="sl-label sl-mark">
              Power rankings
            </h2>
            <PowerRankingsList teams={intelligence.data.teams} />
          </section>

          <section aria-labelledby="league-allplay-h" className="flex flex-col gap-1">
            <h2 id="league-allplay-h" className="sl-label sl-mark">
              All-play record and luck
            </h2>
            <AllPlayLuckList teams={intelligence.data.teams} />
          </section>

          <section aria-labelledby="league-heatmap-h" className="flex flex-col gap-1">
            <h2 id="league-heatmap-h" className="sl-label sl-mark">
              Positional strength
            </h2>
            <PositionalStrengthGrid
              teams={intelligence.data.teams}
              entries={intelligence.data.positionalHeatmap}
            />
          </section>

          <section aria-labelledby="league-manager-h" className="flex flex-col gap-1">
            <h2 id="league-manager-h" className="sl-label sl-mark">
              Manager tendencies
            </h2>
            <ManagerTendenciesList teams={intelligence.data.teams} />
          </section>

          <section aria-labelledby="league-playoffs-h" className="flex flex-col gap-1">
            <h2 id="league-playoffs-h" className="sl-label sl-mark">
              Playoff odds
            </h2>
            <PlayoffOddsSection
              teams={intelligence.data.teams}
              playoffTeams={intelligence.data.playoffTeams}
            />
          </section>
        </>
      )}
    </div>
  );
}
