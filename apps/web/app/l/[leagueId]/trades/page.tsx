import { ArrowLeftRight } from "lucide-react";
import { notFound } from "next/navigation";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase } from "../../../../lib/client/nav";
import {
  getLeagueOverview,
  getStandings,
  getTeamDetail,
} from "../../../../lib/server/league-views";
import { findTradesForLeague } from "../../../../lib/server/trades";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { SeasonStateNotice, seasonStateFor } from "../_components/season-state-notice";
import { Analyzer, type AnalyzerTeam } from "./_components/analyzer";
import { parseIdList, parseOther, parseTab } from "./_components/format";
import { SuggestionCard } from "./_components/suggestion-card";
import { TradesTabs } from "./_components/tabs";

const MAX_SHOWN = 10;

type Raw = string | string[] | undefined;

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ tab?: Raw; other?: Raw; give?: Raw; get?: Raw }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const tab = parseTab(sp.tab);

  const read = readPage((h, now) => {
    const overview = getLeagueOverview(h, leagueId, now);
    if (!overview.ok || seasonStateFor(overview.data.status) !== null) {
      return { overview, standings: null, finder: null, teams: null };
    }
    const standings = getStandings(h, leagueId, now);
    if (tab === "finder") {
      return { overview, standings, finder: findTradesForLeague(h, leagueId, now), teams: null };
    }
    const teams: AnalyzerTeam[] = [];
    if (standings.ok) {
      for (const row of standings.data.rows) {
        const detail = getTeamDetail(h, leagueId, row.rosterId, now);
        if (!detail.ok) continue;
        teams.push({
          rosterId: row.rosterId,
          teamName: row.teamName,
          isMine: row.isMine,
          players: detail.data.players.map((p) => ({
            playerId: p.playerId,
            name: p.name,
            position: p.position,
            nflTeam: p.nflTeam,
            slot: p.slot,
          })),
        });
      }
    }
    return { overview, standings, finder: null, teams };
  });
  if (!read.ok) return <DbError retryHref={`${base}/trades`} />;
  const { overview, standings, finder, teams } = read.value;
  const now = read.now;
  if (!overview.ok && overview.reason === "not_found") notFound();
  if (!overview.ok) return <DbError retryHref={`${base}/trades`} />;

  const heading = <h1 className="text-2xl font-semibold tracking-tight">Trades</h1>;

  if (seasonStateFor(overview.data.status) !== null) {
    return (
      <div className="flex flex-col gap-3" data-testid="trades-page">
        {heading}
        <SeasonStateNotice
          status={overview.data.status}
          testid="trades"
          preseasonMessage="The season has not started. Trade ideas begin once the first NFL week opens."
          offseasonMessage="The season is over. Trade ideas will be back when the new season starts."
        />
      </div>
    );
  }

  const hasMine = standings?.ok === true && standings.data.rows.some((r) => r.isMine);
  if (!hasMine || (finder !== null && !finder.ok && finder.reason === "no_team")) {
    return (
      <div className="flex flex-col gap-3" data-testid="trades-page">
        {heading}
        <NoTeamState leagueId={leagueId} />
      </div>
    );
  }

  const names = new Map(
    standings?.ok ? standings.data.rows.map((r) => [r.rosterId, r.teamName] as const) : [],
  );
  const freshness =
    finder?.ok === true
      ? finder.data.freshness
      : standings?.ok === true
        ? standings.data.freshness
        : null;

  return (
    <div className="flex flex-col gap-3" data-testid="trades-page">
      <div>
        {heading}
        <p className="text-sm text-muted-foreground">
          Trades that help both teams, and a builder for any trade.
        </p>
        {freshness ? <DataFreshness freshness={freshness} now={now} className="mt-1" /> : null}
      </div>
      {freshness ? <StaleBanner freshness={freshness} now={now} /> : null}
      <TradesTabs leagueId={leagueId} tab={tab} />
      {tab === "finder" ? (
        finder === null || !finder.ok ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No trade data yet"
            message="Check back after the next sync."
          />
        ) : finder.data.suggestions.length === 0 ? (
          <div data-testid="trades-empty">
            <EmptyState
              icon={ArrowLeftRight}
              title="No trades found that help both teams right now."
              message="Try the Analyzer to build your own trade."
            />
          </div>
        ) : (
          <>
            <ol className="flex max-w-3xl flex-col gap-3" data-testid="trades-finder-list">
              {finder.data.suggestions.slice(0, MAX_SHOWN).map((s, i) => (
                <SuggestionCard
                  key={`${String(s.otherRosterId)}:${s.give.map((p) => p.playerId).join(",")}:${s.get.map((p) => p.playerId).join(",")}`}
                  leagueId={leagueId}
                  suggestion={s}
                  teamName={names.get(s.otherRosterId) ?? "Another team"}
                  top={i === 0}
                />
              ))}
            </ol>
            {finder.data.suggestions.length > MAX_SHOWN ? (
              <p
                className="text-sm text-muted-foreground tabular-nums"
                data-testid="trades-more-note"
              >
                Showing the top {MAX_SHOWN} of {finder.data.suggestions.length} ideas.
              </p>
            ) : null}
          </>
        )
      ) : teams !== null && teams.length > 1 ? (
        <Analyzer
          leagueId={leagueId}
          teams={teams}
          initial={{
            other: parseOther(sp.other),
            give: parseIdList(sp.give),
            get: parseIdList(sp.get),
          }}
        />
      ) : (
        <EmptyState
          icon={ArrowLeftRight}
          title="No other teams to trade with"
          message="Check back after the next sync."
        />
      )}
    </div>
  );
}
