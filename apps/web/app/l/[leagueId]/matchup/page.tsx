import { Swords } from "lucide-react";
import { notFound } from "next/navigation";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getMatchup } from "../../../../lib/server/matchup";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { ScoreRange } from "./_components/score-range";
import { SwingPlayersList } from "./_components/swing-players";
import { WinProbability } from "./_components/win-probability";

export default async function MatchupPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const retryHref = `${base}/matchup`;
  const week = parseWeek(sp.week);

  const read = readPage((h, now) => getMatchup(h, leagueId, week !== null ? { week } : {}, now));
  if (!read.ok) return <DbError retryHref={retryHref} />;
  const matchup = read.value;
  const now = read.now;

  if (!matchup.ok) {
    if (matchup.reason === "not_found") notFound();
    if (matchup.reason === "no_team") {
      return (
        <div className="flex flex-col gap-3" data-testid="matchup-page">
          <h1 className="text-2xl font-semibold tracking-tight">Matchup</h1>
          <NoTeamState leagueId={leagueId} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="matchup-page">
        <h1 className="text-2xl font-semibold tracking-tight">Matchup</h1>
        <EmptyState
          icon={Swords}
          title="No matchup this week"
          message="You're on a bye this week, or no opponent has been scheduled yet."
        />
      </div>
    );
  }

  const data = matchup.data;

  return (
    <div className="flex flex-col gap-4" data-testid="matchup-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Matchup</h1>
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">Week {data.week}</span>
          {" · "}
          {data.team.teamName} vs {data.opponent.teamName}
        </p>
        <DataFreshness freshness={data.freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={data.freshness} now={now} />

      <section aria-labelledby="matchup-winprob-h" className="flex flex-col gap-2">
        <h2 id="matchup-winprob-h" className="sl-label sl-mark">
          Win probability
        </h2>
        <WinProbability
          teamName={data.team.teamName}
          teamProbability={data.winProbability}
          opponentName={data.opponent.teamName}
          opponentProbability={data.opponentWinProbability}
          tieProbability={data.tieProbability}
        />
      </section>

      <section aria-labelledby="matchup-score-range-h" className="flex flex-col gap-2">
        <h2 id="matchup-score-range-h" className="sl-label sl-mark">
          Score range
        </h2>
        <ScoreRange
          label={`Projected score range for week ${data.week}`}
          teams={[
            {
              label: data.team.teamName,
              p10: data.team.p10,
              p50: data.team.p50,
              p90: data.team.p90,
              highlight: true,
            },
            {
              label: data.opponent.teamName,
              p10: data.opponent.p10,
              p50: data.opponent.p50,
              p90: data.opponent.p90,
            },
          ]}
        />
      </section>

      <section aria-labelledby="matchup-swing-h" className="flex flex-col gap-2">
        <h2 id="matchup-swing-h" className="sl-label sl-mark">
          Swing players
        </h2>
        <p className="text-sm text-muted-foreground">
          Starters whose range of likely outcomes could decide this matchup.
        </p>
        <SwingPlayersList
          players={data.swingPlayers}
          yourRosterId={data.team.rosterId}
          opponentTeamName={data.opponent.teamName}
        />
      </section>
    </div>
  );
}
