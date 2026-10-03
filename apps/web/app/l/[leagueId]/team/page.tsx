import { notFound } from "next/navigation";
import { DbError } from "../../../../components/db-error";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getMyTeam } from "../../../../lib/server/league-views";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { TeamView } from "../_components/team-view";

export default async function MyTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ week?: string | string[]; highlight?: string | string[] }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    team: getMyTeam(h, leagueId, now),
  }));
  if (read.ok && !read.value.overview.ok && read.value.overview.reason === "not_found") notFound();
  if (!read.ok || !read.value.overview.ok)
    return <DbError retryHref={`${leagueBase(leagueId)}/team`} />;
  const week = parseWeek(sp.week) ?? read.value.overview.data.currentWeek;
  if (!read.value.team.ok) {
    return (
      <div className="flex flex-col gap-3" data-testid="team-page">
        <h1 className="text-2xl font-semibold tracking-tight">My Team</h1>
        <NoTeamState leagueId={leagueId} />
      </div>
    );
  }
  return (
    <TeamView
      team={read.value.team.data}
      week={week}
      now={read.now}
      highlight={null}
      heading="My Team"
      totalRosters={read.value.overview.data.totalRosters}
    />
  );
}
