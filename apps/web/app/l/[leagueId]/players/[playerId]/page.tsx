import { notFound } from "next/navigation";
import { DbError } from "../../../../../components/db-error";
import { leagueBase } from "../../../../../lib/client/nav";
import { getPlayerDetail } from "../../../../../lib/server/players";
import { readPage } from "../../_components/load";
import { PlayerDetailView } from "../_components/player-detail-view";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string; playerId: string }>;
}) {
  const { leagueId, playerId } = await params;
  const base = leagueBase(leagueId);

  const read = readPage((h, now) => getPlayerDetail(h, leagueId, playerId, now));
  if (!read.ok) return <DbError retryHref={`${base}/players/${encodeURIComponent(playerId)}`} />;
  if (!read.value.ok) notFound();

  return <PlayerDetailView player={read.value.data} now={read.now} backHref={`${base}/players`} />;
}
