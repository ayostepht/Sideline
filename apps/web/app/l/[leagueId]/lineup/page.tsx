import { notFound } from "next/navigation";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { Badge } from "../../../../components/ui/badge";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getStandings } from "../../../../lib/server/league-views";
import { getLineup } from "../../../../lib/server/lineup";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { SeasonStateNotice, seasonStateFor } from "../_components/season-state-notice";
import {
  isMineRoster,
  parseMode,
  parseRosterId,
  rosterExists,
  teamNameFor,
} from "./_components/format";
import { LineupIssuesBanner } from "./_components/issues-banner";
import { ModeToggle } from "./_components/mode-toggle";
import { OpenInSleeperButton } from "./_components/open-in-sleeper";
import { RosterToggle } from "./_components/roster-toggle";
import { SlotColumn } from "./_components/slot-column";
import { LineupSummaryBanner } from "./_components/summary-banner";
import { SwapList } from "./_components/swap-list";

export default async function LineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    week?: string | string[];
    mode?: string | string[];
    roster?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const week = parseWeek(sp.week);
  const mode = parseMode(sp.mode);
  const rosterId = parseRosterId(sp.roster);

  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    standings: getStandings(h, leagueId, now),
    lineup: getLineup(
      h,
      leagueId,
      {
        mode,
        ...(week !== null ? { week } : {}),
        ...(rosterId !== undefined ? { rosterId } : {}),
      },
      now,
    ),
  }));
  if (!read.ok) return <DbError retryHref={`${base}/lineup`} />;
  const { overview, standings, lineup } = read.value;
  const now = read.now;
  if (!overview.ok && overview.reason === "not_found") notFound();
  if (!overview.ok) return <DbError retryHref={`${base}/lineup`} />;

  const seasonState = seasonStateFor(overview.data.status);
  if (seasonState !== null) {
    return (
      <div className="flex flex-col gap-3" data-testid="lineup-page">
        <h1 className="text-2xl font-semibold tracking-tight">Lineup</h1>
        <SeasonStateNotice
          status={overview.data.status}
          testid="lineup"
          preseasonMessage="The season has not started. Lineup advice begins once the first NFL week opens."
          offseasonMessage="The season is over. Lineup advice will be back when the new season starts."
        />
      </div>
    );
  }

  if (!lineup.ok) {
    if (rosterId !== undefined && standings.ok && !rosterExists(standings.data.rows, rosterId)) {
      notFound();
    }
    if (lineup.reason === "no_team") {
      return (
        <div className="flex flex-col gap-3" data-testid="lineup-page">
          <h1 className="text-2xl font-semibold tracking-tight">Lineup</h1>
          <NoTeamState leagueId={leagueId} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="lineup-page">
        <h1 className="text-2xl font-semibold tracking-tight">Lineup</h1>
        <EmptyState title="No lineup data yet" message="Check back after the next sync." />
      </div>
    );
  }

  const data = lineup.data;
  const rows = standings.ok ? standings.data.rows : [];
  const mine = isMineRoster(rows, data.rosterId);
  const viewedTeamName = teamNameFor(rows, data.rosterId);
  const opponentName =
    data.opponentRosterId !== null ? teamNameFor(rows, data.opponentRosterId) : null;
  const toggleRoster = mine ? undefined : data.rosterId;

  return (
    <div className="flex flex-col gap-3" data-testid="lineup-page">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Lineup</h1>
          {mine ? (
            <Badge variant="you" data-testid="lineup-mine-badge">
              You
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="lineup-viewing-label">
          {mine ? "Your lineup" : `${viewedTeamName}'s lineup`}
          {" · "}
          <span className="tabular-nums">Week {data.week}</span>
        </p>
        <DataFreshness freshness={data.freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={data.freshness} now={now} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModeToggle
          leagueId={leagueId}
          week={data.week}
          mode={data.mode}
          {...(toggleRoster !== undefined ? { roster: toggleRoster } : {})}
        />
        <RosterToggle
          leagueId={leagueId}
          week={data.week}
          mode={data.mode}
          mine={mine}
          opponentRosterId={data.opponentRosterId}
          opponentName={opponentName}
        />
      </div>
      <LineupSummaryBanner pointDelta={data.pointDelta} swapCount={data.swaps.length} />
      <LineupIssuesBanner issues={data.issues} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SlotColumn
          title="Current"
          assignment={data.currentAssignment}
          players={data.players}
          mode={data.mode}
          week={data.week}
          showReasons={false}
          testid="lineup-current"
        />
        <SlotColumn
          title="Optimal"
          assignment={data.optimalAssignment}
          players={data.players}
          mode={data.mode}
          week={data.week}
          showReasons
          testid="lineup-optimal"
        />
      </div>
      <SwapList swaps={data.swaps} players={data.players} />
      {mine ? <OpenInSleeperButton leagueId={leagueId} /> : null}
    </div>
  );
}
