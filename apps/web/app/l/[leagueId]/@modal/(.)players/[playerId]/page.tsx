import { notFound } from "next/navigation";
import { DbError } from "../../../../../../components/db-error";
import { PlayerModal } from "../../../../../../components/player-modal";
import { getPlayerDetail } from "../../../../../../lib/server/players";
import { readPage } from "../../../_components/load";
import { PlayerDetailView } from "../../../players/_components/player-detail-view";

/** Same data as the full page (`players/[playerId]/page.tsx`), shown as a pop-up over the current page. */
export default async function PlayerModalPage({
  params,
}: {
  params: Promise<{ leagueId: string; playerId: string }>;
}) {
  const { leagueId, playerId } = await params;
  const read = readPage((h, now) => getPlayerDetail(h, leagueId, playerId, now));
  if (!read.ok) {
    return (
      <PlayerModal loadingLabel="Player unavailable">
        <DbError
          retryHref={`/l/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}`}
        />
      </PlayerModal>
    );
  }
  if (!read.value.ok) notFound();
  return (
    <PlayerModal>
      <PlayerDetailView player={read.value.data} now={read.now} inModal />
    </PlayerModal>
  );
}
