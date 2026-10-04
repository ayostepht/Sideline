import type { TeamDetail, TeamPlayerRow } from "@sideline/shared";
import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { DataFreshness } from "../../../../components/data-freshness";
import { EmptyState } from "../../../../components/empty-state";
import { PlayerRow } from "../../../../components/player-row";
import { ScoreboardHero } from "../../../../components/scoreboard-hero";
import { StaleBanner } from "../../../../components/stale-banner";
import { Badge } from "../../../../components/ui/badge";
import { displayName, formatPoints, formatRecord, groupPlayers, isOnBye } from "./format";
import { ScrollToTarget } from "./scroll-to";
import { SeasonStateNotice } from "./season-state-notice";

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`team-${id}-h`} data-testid={`team-section-${id}`}>
      <h2 id={`team-${id}-h`} className="sl-label sl-mark mb-1">
        {title} <span className="tabular-nums">({count})</span>
      </h2>
      <div className="flex flex-col divide-y rounded-card border bg-card">{children}</div>
    </section>
  );
}

export function TeamView({
  team,
  week,
  now,
  highlight,
  heading,
  backHref,
  totalRosters,
  seasonStatus,
}: {
  team: TeamDetail;
  week: number | null;
  now: Date;
  highlight: string | null;
  /** The h1 text. */
  heading: string;
  /** When set, shows a back link above the heading. */
  backHref?: string;
  /** League size, for the Rank stat's "of N". Omitted when the caller has not fetched it. */
  totalRosters?: number;
  /** LeagueOverview.status, drives the preseason/offseason notice. */
  seasonStatus: string;
}) {
  const { roster } = team;
  const g = groupPlayers(team.players);
  const hasHighlight = highlight !== null && team.players.some((p) => p.playerId === highlight);
  const renderRow = (p: TeamPlayerRow, slot: string | undefined) => {
    const on = highlight === p.playerId;
    const unknown = p.name.trim() === "";
    const bye = !unknown && isOnBye(p, week);
    return (
      <div
        key={p.playerId}
        id={`player-${p.playerId}`}
        className="scroll-mt-24"
        data-testid={on ? "team-highlighted-row" : "team-row"}
      >
        <PlayerRow
          name={displayName(p)}
          position={unknown ? null : p.position}
          {...(unknown ? {} : { team: p.nflTeam })}
          injuryStatus={unknown ? null : p.injuryStatus}
          {...(slot === undefined ? {} : { slot })}
          injuryDetail={unknown ? null : p.injuryBodyPart}
          meta={bye ? <Badge variant="info">Bye</Badge> : null}
          highlighted={on}
          highlightLabel="Search result"
          className="md:max-w-none"
          // Reserves the stat column's width for weekly points once TeamPlayerRow carries them
          // (backend follow-up, see RISKS in the T3.8b task report); kept invisible rather than
          // fabricated so a future data addition does not shift this row's layout.
          stat={
            <span aria-hidden="true" className="invisible">
              00.0
            </span>
          }
        />
      </div>
    );
  };
  const empty =
    team.players.length === 0 && team.emptySlots.length === 0 ? (
      <EmptyState title="No players yet" message="This roster is empty." />
    ) : null;
  return (
    <div className="flex flex-col gap-3" data-testid="team-view">
      <div>
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-link underline-offset-4 hover:underline"
            data-testid="team-back-link"
          >
            <ChevronLeft className="size-4" aria-hidden />
            League
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">{heading}</h1>
          {roster.isMine ? (
            <Badge variant="accent" data-testid="team-mine-badge">
              Your team
            </Badge>
          ) : null}
        </div>
        {roster.managerName ? (
          <p className="mt-1 text-sm text-muted-foreground">{roster.managerName}</p>
        ) : null}
        <ScoreboardHero
          className="mt-2"
          stats={[
            { label: "Record", value: formatRecord(roster) },
            { label: "PF", value: formatPoints(roster.pointsFor) },
            {
              label: "Rank",
              value:
                totalRosters === undefined ? (
                  `Rank ${roster.rank}`
                ) : (
                  <>
                    {`Rank ${roster.rank}`}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      of {totalRosters}
                    </span>
                  </>
                ),
            },
          ]}
        />
        <DataFreshness freshness={team.freshness} now={now} className="mt-2" />
      </div>
      <StaleBanner freshness={team.freshness} now={now} />
      <SeasonStateNotice
        status={seasonStatus}
        testid="team"
        preseasonMessage="The season has not started. Weekly details like bye weeks begin once it does."
        offseasonMessage="The season is over. Weekly details like bye weeks will be back when the new season starts."
      />
      {empty}
      {g.starters.length > 0 || team.emptySlots.length > 0 ? (
        <Section id="starters" title="Starters" count={g.starters.length + team.emptySlots.length}>
          {g.starters.map((p) => renderRow(p, p.starterSlot ?? undefined))}
          {team.emptySlots.map((label, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: labels repeat (FLEX, FLEX)
              key={`${label}-${i}`}
              className="flex min-h-11 items-center gap-3 px-3 py-2"
              data-testid="team-empty-slot"
            >
              <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Plus className="size-4" aria-hidden />
                Empty slot
              </span>
            </div>
          ))}
        </Section>
      ) : null}
      {g.bench.length > 0 ? (
        <Section id="bench" title="Bench" count={g.bench.length}>
          {g.bench.map((p) => renderRow(p, "BN"))}
        </Section>
      ) : null}
      {g.ir.length > 0 ? (
        <Section id="ir" title="IR" count={g.ir.length}>
          {g.ir.map((p) => renderRow(p, "IR"))}
        </Section>
      ) : null}
      {g.taxi.length > 0 ? (
        <Section id="taxi" title="Taxi" count={g.taxi.length}>
          {g.taxi.map((p) => renderRow(p, "TX"))}
        </Section>
      ) : null}
      {hasHighlight ? <ScrollToTarget targetId={`player-${highlight}`} /> : null}
    </div>
  );
}
