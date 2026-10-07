import type { LineupResponse, PlayerDetailResponse } from "@sideline/shared";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { DataFreshness } from "../../../../components/data-freshness";
import { DbError } from "../../../../components/db-error";
import { EmptyState } from "../../../../components/empty-state";
import { PlayerLink } from "../../../../components/player-link";
import { teamLabel } from "../../../../components/team-label";
import { PositionBadge } from "../../../../components/position-badge";
import { ScoreboardHero } from "../../../../components/scoreboard-hero";
import { StaleBanner } from "../../../../components/stale-banner";
import { TrendIndicator } from "../../../../components/trend-indicator";
import { Badge } from "../../../../components/ui/badge";
import { buttonVariants } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../../components/ui/card";
import { hasMaterialSwaps } from "../../../../lib/client/lineup-recommendation";
import { leagueBase, parseWeek } from "../../../../lib/client/nav";
import { getLeagueOverview, getMyTeam, getStandings } from "../../../../lib/server/league-views";
import { getLineup } from "../../../../lib/server/lineup";
import { getMatchup } from "../../../../lib/server/matchup";
import { getPlayerDetail } from "../../../../lib/server/players";
import { getWaivers } from "../../../../lib/server/waivers";
import {
  formatPoints,
  formatRecord,
  formatSignedPoints,
  lineupIssueLabel,
  risingFreeAgents,
  risingRosterPlayers,
  selectRisers,
  selectStandingsSnippet,
  topWaiverTargets,
  type RiserRow,
} from "../_components/format";
import { readPage } from "../_components/load";
import { NoTeamState } from "../_components/no-team";
import { SeasonStateNotice } from "../_components/season-state-notice";

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
  const requestedWeek = parseWeek(sp.week);
  const read = readPage((h, now) => {
    const team = getMyTeam(h, leagueId, now);
    const waivers = getWaivers(
      h,
      leagueId,
      requestedWeek === null ? {} : { week: requestedWeek },
      now,
    );
    // Rising-players card, "my roster" half (REQUIREMENTS 2): one `getPlayerDetail` call per
    // roster player. These are direct in-process function calls sharing this one `readPage`
    // handle, not N separate HTTP requests, so looping over a ~15-20 player roster here is cheap.
    const rosterDetails: PlayerDetailResponse[] = team.ok
      ? team.data.players
          .map((p) => getPlayerDetail(h, leagueId, p.playerId, now))
          .filter((r): r is { ok: true; data: PlayerDetailResponse } => r.ok)
          .map((r) => r.data)
      : [];
    return {
      overview: getLeagueOverview(h, leagueId, now),
      team,
      standings: getStandings(h, leagueId, now),
      lineup: getLineup(
        h,
        leagueId,
        requestedWeek === null ? { mode: "auto" } : { week: requestedWeek, mode: "auto" },
        now,
      ),
      waivers,
      rosterDetails,
      matchup: getMatchup(h, leagueId, requestedWeek === null ? {} : { week: requestedWeek }, now),
    };
  });
  if (!read.ok) return <DbError retryHref={base} />;
  const { overview, team, standings, lineup, waivers, rosterDetails, matchup } = read.value;
  const now = read.now;
  if (!overview.ok) return <DbError retryHref={base} />;
  const week = requestedWeek ?? overview.data.currentWeek;
  const rows = standings.ok ? standings.data.rows : [];
  const freshness = overview.data.freshness;
  const waiverTargets = waivers.ok ? topWaiverTargets(waivers.data.forMyTeam) : [];
  const hasWaiverCandidates = waivers.ok && waivers.data.forMyTeam.length > 0;
  const risers: RiserRow[] = waivers.ok
    ? selectRisers(risingRosterPlayers(rosterDetails), risingFreeAgents(waivers.data.bestAvailable))
    : [];

  return (
    <div className="flex flex-col gap-3" data-testid="home-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <DataFreshness freshness={freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={freshness} now={now} />
      <SeasonStateNotice
        status={overview.data.status}
        testid="home"
        preseasonMessage="The season has not started. Weekly details like byes and matchups begin once it does."
        offseasonMessage="The season is over. Weekly details like byes and matchups will be back when the new season starts."
      />

      {team.ok ? (
        <Card data-testid="home-team-card">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-base font-bold leading-6">
                {team.data.roster.teamName}
              </h2>
              <Badge variant="accent">Your team</Badge>
            </div>
            <ScoreboardHero
              className="mt-2"
              stats={[
                { label: "Record", value: formatRecord(team.data.roster) },
                { label: "PF", value: formatPoints(team.data.roster.pointsFor) },
                {
                  label: "Rank",
                  value: (
                    <>
                      <span data-testid="home-rank">Rank {team.data.roster.rank}</span>{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        of {overview.data.totalRosters}
                      </span>
                    </>
                  ),
                },
              ]}
            />
          </CardHeader>
          <CardContent>
            {lineup.ok ? <HomeIssues lineup={lineup.data} week={week} base={base} /> : null}
            <Link
              href={`${base}/team${week === null ? "" : `?week=${week}`}`}
              className={`${buttonVariants({ variant: "outline" })} mt-2 w-full sm:w-auto`}
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

      {matchup.ok ? (
        <Card data-testid="home-matchup">
          <CardHeader>
            <h2 className="sl-label sl-mark">This week's matchup</h2>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums" data-testid="home-matchup-win-pct">
                {Math.round(matchup.data.winProbability * 100)}%
              </span>
              <span className="text-sm text-muted-foreground">to win</span>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              vs {matchup.data.opponent.teamName}
              {Math.round(matchup.data.tieProbability * 100) > 0
                ? ` · ${Math.round(matchup.data.tieProbability * 100)}% tie chance`
                : ""}
            </p>
            <Link
              href={`${base}/matchup`}
              className={`${buttonVariants({ variant: "ghost" })} mt-2 -ml-3`}
              data-testid="home-see-matchup"
            >
              See full matchup
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="home-standings">
        <CardHeader>
          <h2 className="sl-label sl-mark">Standings</h2>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No teams yet"
              message="Standings show up after the first sync."
            />
          ) : (
            <ol className="flex flex-col divide-y">
              {selectStandingsSnippet(rows).map((r) => (
                <li
                  key={r.rosterId}
                  data-mine={r.isMine ? "true" : undefined}
                  data-testid="home-standings-row"
                  className={`flex min-h-11 items-center gap-3 px-2 py-1 text-sm ${
                    r.isMine ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-semibold tabular-nums">
                    <span className="sr-only">Rank </span>
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.teamName}</span>
                  {r.isMine ? <Badge variant="you">You</Badge> : null}
                  <span className="shrink-0 font-bold tabular-nums">{formatRecord(r)}</span>
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

      {waivers.ok ? (
        <Card data-testid="home-waiver-targets">
          <CardHeader>
            <h2 className="sl-label sl-mark">Waiver targets</h2>
          </CardHeader>
          <CardContent>
            {waiverTargets.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title={
                  hasWaiverCandidates
                    ? "No upgrades beat your roster this week"
                    : "No waiver targets right now"
                }
                message={
                  hasWaiverCandidates
                    ? "Every available player would make your lineup worse right now. Check back after the next sync."
                    : "Check back after the next sync or widen your search on the Waivers page."
                }
              />
            ) : (
              <ol className="flex flex-col divide-y">
                {waiverTargets.map((c) => (
                  <li
                    key={c.playerId}
                    data-testid="home-waiver-target-row"
                    className="relative flex min-h-11 items-center gap-3 px-2 py-1 text-sm hover:bg-muted"
                  >
                    <PositionBadge position={c.position} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <PlayerLink playerId={c.playerId} stretch className="truncate font-medium">
                        {c.name}
                      </PlayerLink>
                      {teamLabel(c.position, c.nflTeam) ? (
                        <span className="text-xs text-muted-foreground">
                          {teamLabel(c.position, c.nflTeam)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatSignedPoints(c.lineupImpact)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <Link
              href={`${base}/waivers`}
              className={`${buttonVariants({ variant: "ghost" })} mt-2 -ml-3`}
              data-testid="home-see-waivers"
            >
              See all waiver targets
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {waivers.ok ? (
        <Card data-testid="home-risers">
          <CardHeader>
            <h2 className="sl-label sl-mark">Rising players</h2>
          </CardHeader>
          <CardContent>
            {risers.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Nobody is trending up"
                message="Rising players, on your roster or available, will show up here."
              />
            ) : (
              <ol className="flex flex-col divide-y">
                {risers.map((r) => (
                  <li key={r.playerId} data-testid="home-riser-row">
                    <Link
                      href={`${base}/players/${encodeURIComponent(r.playerId)}`}
                      className="flex min-h-11 items-center gap-3 px-2 py-1 text-sm hover:bg-muted"
                    >
                      <PositionBadge position={r.position} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{r.name}</span>
                        {teamLabel(r.position, r.nflTeam) ? (
                          <span
                            className="text-xs text-muted-foreground"
                            data-testid="player-row-team"
                          >
                            {teamLabel(r.position, r.nflTeam)}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.source === "roster" ? "Your roster" : "Free agent"}
                      </span>
                      <TrendIndicator trend="rising" />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <Link
              href={`${base}/players`}
              className={`${buttonVariants({ variant: "ghost" })} mt-2 -ml-3`}
              data-testid="home-see-players"
            >
              See all players
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * LINEUP-6: the Home "This week" card. `issues` and `swaps`/`pointDelta` come from the real
 * optimizer (T3.7), not a heuristic. The lime strip at the bottom is Home's one top-recommendation
 * accent (ADR-011 item 6): swap-and-point-delta framing when the optimizer found a better lineup,
 * or a plain "optimal" confirmation when it did not, so it is always present with real content.
 */
function HomeIssues({
  lineup,
  week,
  base,
}: {
  lineup: LineupResponse;
  week: number | null;
  base: string;
}) {
  const { issues } = lineup;
  const n = issues.length;
  const Icon = n === 0 ? CircleCheck : CircleAlert;
  const headline =
    n === 0
      ? "No lineup issues this week"
      : n === 1
        ? "1 starter needs attention"
        : `${n} starters need attention`;
  const lineupHref = `${base}/lineup${week === null ? "" : `?week=${week}`}`;
  // Shared with the Lineup page's summary banner and swap list so both agree on what counts
  // as an actionable recommendation (see lib/client/lineup-recommendation.ts).
  const hasSwaps = hasMaterialSwaps(lineup.pointDelta, lineup.swaps.length);
  return (
    <div data-testid="home-issues">
      <p
        className={`flex items-center gap-2 text-base font-semibold ${n === 0 ? "text-positive" : "text-warning"}`}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {headline}
        {n > 0 ? ":" : ""}
      </p>
      {n > 0 ? (
        <ul className="mt-1 flex flex-col" data-testid="home-starters">
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`} data-testid="home-issue-row">
              <Link
                href={lineupHref}
                className="flex min-h-11 items-center gap-2 rounded-control px-1 text-sm hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">
                  {lineupIssueLabel(issue, lineup.players)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={lineupHref}
        data-testid="home-lineup-insight"
        className="mt-2 flex min-h-11 items-center gap-2 rounded-control bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
      >
        <Sparkles className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {hasSwaps
            ? `${lineup.swaps.length === 1 ? "1 swap" : `${lineup.swaps.length} swaps`} available`
            : "Your lineup is optimal"}
        </span>
        {hasSwaps ? (
          <span className="shrink-0 tabular-nums">
            {lineup.pointDelta >= 0 ? "+" : ""}
            {lineup.pointDelta.toFixed(1)} pts
          </span>
        ) : null}
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
