import { notFound } from "next/navigation";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase } from "../../../../lib/client/nav";
import { getLeagueOverview } from "../../../../lib/server/league-views";
import { getPlayersList } from "../../../../lib/server/players";
import { readPage } from "../_components/load";
import {
  parsePageParam,
  parsePositionParam,
  parseQueryParam,
  PLAYERS_PAGE_SIZE,
} from "./_components/format";
import { PlayersExplorer } from "./_components/players-explorer";

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    page?: string | string[];
    position?: string | string[];
    q?: string | string[];
  }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const page = parsePageParam(sp.page);
  const position = parsePositionParam(sp.position);
  const q = parseQueryParam(sp.q);

  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    players: getPlayersList(
      h,
      leagueId,
      {
        page,
        pageSize: PLAYERS_PAGE_SIZE,
        ...(position !== undefined ? { position } : {}),
        ...(q !== undefined ? { q } : {}),
      },
      now,
    ),
  }));
  if (!read.ok) return <DbError retryHref={`${base}/players`} />;
  const { overview, players } = read.value;
  if (!overview.ok && overview.reason === "not_found") notFound();
  if (!overview.ok) return <DbError retryHref={`${base}/players`} />;
  if (!players.ok) notFound();

  const data = players.data;
  const now = read.now;

  return (
    <div className="flex flex-col gap-3" data-testid="players-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
        <DataFreshness freshness={data.freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={data.freshness} now={now} />
      {overview.data.currentWeek === null ? (
        <p
          className="rounded-card border bg-card px-3 py-2 text-sm text-muted-foreground"
          data-testid="players-preseason"
        >
          The season has not started. Scoring and trends fill in once the first week is played.
        </p>
      ) : null}
      <PlayersExplorer
        leagueId={leagueId}
        initialData={data}
        initialPosition={position}
        initialQuery={q}
        initialPage={page}
      />
    </div>
  );
}
