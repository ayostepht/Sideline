import { ArrowLeftRight } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase } from "../../../../lib/client/nav";
import {
  getLeagueOverview,
  getStandings,
  getAllTeamRosters,
} from "../../../../lib/server/league-views";
import { findTradesForLeague } from "../../../../lib/server/trades";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { SeasonStateNotice, seasonStateFor } from "../_components/season-state-notice";
import { Analyzer, type AnalyzerTeam } from "./_components/analyzer";
import { parseIdList, parseOther, parseTab, type TradeSelection } from "./_components/format";
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
      return { overview, standings: null };
    }
    return { overview, standings: getStandings(h, leagueId, now) };
  });
  if (!read.ok) return <DbError retryHref={`${base}/trades`} />;
  const { overview, standings } = read.value;
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
  if (!hasMine) {
    return (
      <div className="flex flex-col gap-3" data-testid="trades-page">
        {heading}
        <NoTeamState leagueId={leagueId} />
      </div>
    );
  }

  const freshness = standings?.ok === true ? standings.data.freshness : null;
  const names = new Map(
    standings?.ok ? standings.data.rows.map((r) => [r.rosterId, r.teamName] as const) : [],
  );

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
      <Suspense fallback={tab === "finder" ? <FinderSkeleton /> : <AnalyzerSkeleton />}>
        {tab === "finder" ? (
          <FinderSection leagueId={leagueId} names={names} />
        ) : (
          <AnalyzerSection
            leagueId={leagueId}
            initial={{
              other: parseOther(sp.other),
              give: parseIdList(sp.give),
              get: parseIdList(sp.get),
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

/**
 * The reads are synchronous, so without a real suspension point React would render the section in
 * the same pass as the shell. Yielding one macrotask lets the shell and skeleton flush first.
 */
const yieldToShell = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function FinderSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-3" data-testid="trades-finder-loading" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-control border bg-card p-3">
          <div className="sl-skeleton h-5 w-40" />
          <div className="sl-skeleton mt-3 h-24 w-full" />
          <div className="sl-skeleton mt-3 h-16 w-full" />
          <div className="sl-skeleton mt-3 h-11 w-40" />
        </div>
      ))}
    </div>
  );
}

function AnalyzerSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="trades-analyzer-loading" aria-hidden>
      <div className="sl-skeleton h-11 w-full max-w-sm" />
      <div className="sl-skeleton h-64 w-full" />
    </div>
  );
}

async function FinderSection({
  leagueId,
  names,
}: {
  leagueId: string;
  names: ReadonlyMap<number, string>;
}) {
  await yieldToShell();
  const base = leagueBase(leagueId);
  const read = readPage((h, now) => findTradesForLeague(h, leagueId, now));
  if (!read.ok) return <DbError retryHref={`${base}/trades`} />;
  const finder = read.value;
  if (!finder.ok && finder.reason === "no_team") return <NoTeamState leagueId={leagueId} />;
  if (!finder.ok) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No trade data yet"
        message="Check back after the next sync."
      />
    );
  }
  if (finder.data.suggestions.length === 0) {
    return (
      <div data-testid="trades-empty">
        <EmptyState
          icon={ArrowLeftRight}
          title="No trades found that help both teams right now."
          message="Try the Analyzer to build your own trade."
        />
      </div>
    );
  }
  return (
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
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="trades-more-note">
          Showing the top {MAX_SHOWN} of {finder.data.suggestions.length} ideas.
        </p>
      ) : null}
    </>
  );
}

async function AnalyzerSection({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: TradeSelection;
}) {
  await yieldToShell();
  const base = leagueBase(leagueId);
  const read = readPage((h, now) => getAllTeamRosters(h, leagueId, now));
  if (!read.ok) return <DbError retryHref={`${base}/trades`} />;
  const rosters = read.value;
  const teams: AnalyzerTeam[] = rosters.ok ? rosters.data.teams : [];
  if (teams.length <= 1) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No other teams to trade with"
        message="Check back after the next sync."
      />
    );
  }
  return <Analyzer leagueId={leagueId} teams={teams} initial={initial} />;
}
