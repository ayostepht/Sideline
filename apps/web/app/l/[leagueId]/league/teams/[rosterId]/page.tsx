import { notFound } from "next/navigation";
import { DbError } from "../../../../../../components/db-error";
import { leagueBase, parseWeek } from "../../../../../../lib/client/nav";
import { getLeagueOverview, getTeamDetail } from "../../../../../../lib/server/league-views";
import { readPage } from "../../../_components/load";
import { TeamView } from "../../../_components/team-view";

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string; rosterId: string }>;
  searchParams: Promise<{ week?: string | string[]; highlight?: string | string[] }>;
}) {
  const { leagueId, rosterId: rawId } = await params;
  const sp = await searchParams;
  if (!/^\d{1,9}$/.test(rawId)) notFound();
  const rosterId = Number(rawId);
  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    team: getTeamDetail(h, leagueId, rosterId, now),
  }));
  if (read.ok && !read.value.overview.ok && read.value.overview.reason === "not_found") notFound();
  if (!read.ok || !read.value.overview.ok) {
    return <DbError retryHref={`${leagueBase(leagueId)}/league/teams/${rosterId}`} />;
  }
  if (!read.value.team.ok) notFound();
  const hl = Array.isArray(sp.highlight) ? sp.highlight[0] : sp.highlight;
  const team = read.value.team.data;
  return (
    <TeamView
      team={team}
      week={parseWeek(sp.week) ?? read.value.overview.data.currentWeek}
      now={read.now}
      highlight={hl ?? null}
      heading={team.roster.teamName}
      backHref={`${leagueBase(leagueId)}/league`}
    />
  );
}
