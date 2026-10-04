import { UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getMyTeam } from "../../../../lib/server/league-views";
import { getWaivers } from "../../../../lib/server/waivers";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { SeasonStateNotice, seasonStateFor } from "../_components/season-state-notice";
import { dropPlayerMap, parsePositions, parseView } from "./_components/format";
import { PriorityAdvisorSection } from "./_components/priority-advisor-section";
import { WaiversSummaryBanner } from "./_components/summary-banner";
import { WaiverBoard } from "./_components/waiver-board";

export default async function WaiversPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    week?: string | string[];
    view?: string | string[];
    positions?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const week = parseWeek(sp.week);
  const view = parseView(sp.view);
  const positions = parsePositions(sp.positions);

  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    waivers: getWaivers(
      h,
      leagueId,
      {
        ...(week !== null ? { week } : {}),
        ...(positions.length > 0 ? { positions } : {}),
      },
      now,
    ),
    myTeam: getMyTeam(h, leagueId, now),
  }));
  if (!read.ok) return <DbError retryHref={`${base}/waivers`} />;
  const { overview, waivers, myTeam } = read.value;
  const now = read.now;
  if (!overview.ok && overview.reason === "not_found") notFound();
  if (!overview.ok) return <DbError retryHref={`${base}/waivers`} />;

  const seasonState = seasonStateFor(overview.data.status);
  if (seasonState !== null) {
    return (
      <div className="flex flex-col gap-3" data-testid="waivers-page">
        <h1 className="text-2xl font-semibold tracking-tight">Waivers</h1>
        <SeasonStateNotice
          status={overview.data.status}
          testid="waivers"
          preseasonMessage="The season has not started. Waiver recommendations begin once the first NFL week opens."
          offseasonMessage="The season is over. Waiver recommendations will be back when the new season starts."
        />
      </div>
    );
  }

  if (!waivers.ok) {
    if (waivers.reason === "no_team") {
      return (
        <div className="flex flex-col gap-3" data-testid="waivers-page">
          <h1 className="text-2xl font-semibold tracking-tight">Waivers</h1>
          <NoTeamState leagueId={leagueId} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="waivers-page">
        <h1 className="text-2xl font-semibold tracking-tight">Waivers</h1>
        <EmptyState
          icon={UserPlus}
          title="No waiver data yet"
          message="Check back after the next sync."
        />
      </div>
    );
  }

  const data = waivers.data;
  const drops = Object.fromEntries(dropPlayerMap(myTeam.ok ? myTeam.data.players : []));

  return (
    <div className="flex flex-col gap-3" data-testid="waivers-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waivers</h1>
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">Week {data.week}</span>
        </p>
        <DataFreshness freshness={data.freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={data.freshness} now={now} />
      <WaiversSummaryBanner forMyTeam={data.forMyTeam} />
      <WaiverBoard
        leagueId={leagueId}
        week={data.week}
        initialView={view}
        initialPositions={positions}
        initialData={data}
        drops={drops}
      />
      <PriorityAdvisorSection advisor={data.priorityAdvisor} now={now} />
    </div>
  );
}
