import { ChevronRight, CircleAlert, CircleCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { StaleBanner } from "../../../../components/stale-banner";
import { Badge } from "../../../../components/ui/badge";
import { buttonVariants } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../../components/ui/card";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getMyTeam, getStandings } from "../../../../lib/server/league-views";
import {
  displayName,
  formatPoints,
  formatRecord,
  issueLabel,
  issuesText,
  selectStandingsSnippet,
  starterIssues,
} from "../_components/format";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const base = leagueBase(leagueId);
  const read = readPage((h, now) => ({
    overview: getLeagueOverview(h, leagueId, now),
    team: getMyTeam(h, leagueId, now),
    standings: getStandings(h, leagueId, now),
  }));
  if (!read.ok) return <DbError retryHref={base} />;
  const { overview, team, standings } = read.value;
  const now = read.now;
  if (!overview.ok) return <DbError retryHref={base} />;
  const week = parseWeek(sp.week) ?? overview.data.currentWeek;
  const rows = standings.ok ? standings.data.rows : [];
  const freshness = overview.data.freshness;

  return (
    <div className="flex flex-col gap-4" data-testid="home-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <DataFreshness freshness={freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={freshness} now={now} />
      {week === null ? (
        <p
          className="rounded-[8px] border bg-card px-3 py-2 text-sm text-muted-foreground"
          data-testid="home-preseason"
        >
          The season has not started. Weekly details like byes and matchups begin once it does.
        </p>
      ) : null}

      {team.ok ? (
        <Card data-testid="home-team-card">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-base font-semibold leading-6">
                {team.data.roster.teamName}
              </h2>
              <Badge variant="accent">Your team</Badge>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{formatRecord(team.data.roster)}</span>
              {" · "}
              {formatPoints(team.data.roster.pointsFor)} PF
              {" · "}
              <span data-testid="home-rank">Rank {team.data.roster.rank}</span> of{" "}
              {overview.data.totalRosters}
            </p>
          </CardHeader>
          <CardContent>
            <HomeIssues players={team.data.players} week={week} base={base} />
            <Link
              href={`${base}/team${week === null ? "" : `?week=${week}`}`}
              className={`${buttonVariants({ variant: "outline" })} mt-3 w-full sm:w-auto`}
              data-testid="home-see-roster"
            >
              See full roster
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <NoTeamState leagueId={leagueId} />
        </Card>
      )}

      <Card data-testid="home-standings">
        <CardHeader>
          <h2 className="text-base font-semibold leading-6">Standings</h2>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No teams yet"
              message="Standings show up after the first sync."
            />
          ) : (
            <ol className="flex flex-col">
              {selectStandingsSnippet(rows).map((r) => (
                <li
                  key={r.rosterId}
                  data-mine={r.isMine ? "true" : undefined}
                  data-testid="home-standings-row"
                  className={`flex min-h-11 items-center gap-3 rounded-[8px] px-2 py-2 text-sm ${
                    r.isMine ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-semibold tabular-nums">
                    <span className="sr-only">Rank </span>
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.teamName}</span>
                  {r.isMine ? <Badge variant="accent">You</Badge> : null}
                  <span className="shrink-0 tabular-nums">{formatRecord(r)}</span>
                </li>
              ))}
            </ol>
          )}
          <Link
            href={`${base}/league${week === null ? "" : `?week=${week}`}`}
            className={`${buttonVariants({ variant: "ghost" })} mt-2 -ml-3`}
            data-testid="home-see-league"
          >
            See full standings
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function HomeIssues({
  players,
  week,
  base,
}: {
  players: Parameters<typeof starterIssues>[0];
  week: number | null;
  base: string;
}) {
  const issues = starterIssues(players, week);
  const n = issues.length;
  const Icon = n === 0 ? CircleCheck : CircleAlert;
  const weekQs = week === null ? "" : `&week=${week}`;
  return (
    <div data-testid="home-issues">
      <p
        className={`flex items-center gap-2 text-base font-semibold ${n === 0 ? "text-positive" : "text-warning"}`}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {issuesText(n)}
        {n > 0 ? ":" : ""}
      </p>
      {n > 0 ? (
        <ul className="mt-1 flex flex-col" data-testid="home-starters">
          {issues.map(({ player, reason }) => (
            <li key={player.playerId} data-testid="home-starter">
              <Link
                href={`${base}/team?highlight=${encodeURIComponent(player.playerId)}${weekQs}`}
                className="flex min-h-11 items-center gap-2 rounded-[8px] px-1 text-sm hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate font-medium" title={displayName(player)}>
                  {displayName(player)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{player.starterSlot}</span>
                {reason === "bye" ? (
                  <Badge variant="info">Bye</Badge>
                ) : (
                  <span className="shrink-0 text-xs font-semibold">({issueLabel(reason)})</span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
