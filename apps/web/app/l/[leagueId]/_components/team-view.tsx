import type { TeamDetail, TeamPlayerRow } from "@sideline/shared";
import { Plus } from "lucide-react";
import { DataFreshness } from "../../../../components/data-freshness";
import { EmptyState } from "../../../../components/empty-state";
import { PlayerRow } from "../../../../components/player-row";
import { StaleBanner } from "../../../../components/stale-banner";
import { Badge } from "../../../../components/ui/badge";
import { displayName, formatPoints, formatRecord, groupPlayers, isOnBye } from "./format";
import { ScrollToTarget } from "./scroll-to";

function RowExtras({ p, week }: { p: TeamPlayerRow; week: number | null }) {
  const bye = isOnBye(p, week);
  const part = p.injuryStatus ? p.injuryBodyPart : null;
  if (!bye && !part) return undefined;
  return (
    <span className="flex flex-col items-end gap-1">
      {bye ? <Badge variant="info">Bye</Badge> : null}
      {part ? <span className="text-xs font-normal text-muted-foreground">{part}</span> : null}
    </span>
  );
}

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
      <h2 id={`team-${id}-h`} className="mb-1 px-3 text-sm font-semibold text-muted-foreground">
        {title} <span className="tabular-nums">({count})</span>
      </h2>
      <div className="flex flex-col divide-y rounded-[12px] border bg-card py-1 md:max-w-2xl">
        {children}
      </div>
    </section>
  );
}

export function TeamView({
  team,
  week,
  now,
  highlight,
  heading,
}: {
  team: TeamDetail;
  week: number | null;
  now: Date;
  highlight: string | null;
  /** The h1 text. */
  heading: string;
}) {
  const { roster } = team;
  const g = groupPlayers(team.players);
  const hasHighlight = highlight !== null && team.players.some((p) => p.playerId === highlight);
  const renderRow = (p: TeamPlayerRow, slot: string | undefined) => {
    const on = highlight === p.playerId;
    const unknown = p.name.trim() === "";
    const extras = unknown ? undefined : RowExtras({ p, week });
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
          {...(extras === undefined ? {} : { stat: extras })}
          highlighted={on}
          highlightLabel="Search result"
          className="md:max-w-none"
        />
      </div>
    );
  };
  const empty =
    team.players.length === 0 && team.emptySlots.length === 0 ? (
      <EmptyState title="No players yet" message="This roster is empty." />
    ) : null;
  return (
    <div className="flex flex-col gap-4" data-testid="team-view">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{heading}</h1>
          {roster.isMine ? (
            <Badge variant="accent" data-testid="team-mine-badge">
              Your team
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {roster.managerName ? `${roster.managerName} · ` : ""}
          <span className="tabular-nums">
            {formatRecord(roster)} · {formatPoints(roster.pointsFor)} PF
          </span>
        </p>
        <DataFreshness freshness={team.freshness} now={now} className="mt-1" />
      </div>
      <StaleBanner freshness={team.freshness} now={now} />
      {week === null ? (
        <p className="text-sm text-muted-foreground" data-testid="team-preseason">
          Weekly details like bye weeks start once the season does.
        </p>
      ) : null}
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
