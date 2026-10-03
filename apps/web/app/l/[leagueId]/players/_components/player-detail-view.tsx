import type { PlayerDetailResponse } from "@sideline/shared";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { DataFreshness } from "../../../../../components/data-freshness";
import { InjuryBadge } from "../../../../../components/injury-badge";
import { PositionBadge } from "../../../../../components/position-badge";
import { ReasonChips } from "../../../../../components/reason-chips";
import { Sparkline } from "../../../../../components/sparkline";
import { StaleBanner } from "../../../../../components/stale-banner";
import { StatCard } from "../../../../../components/stat-card";
import { TrendIndicator } from "../../../../../components/trend-indicator";
import { Badge } from "../../../../../components/ui/badge";
import { WhySheet } from "../../../../../components/why-sheet";
import {
  formatConsistency,
  formatDelta,
  formatNetCount,
  formatPpg,
  formatUsageDelta,
  formatUsageValue,
  MOMENTUM_TONE,
  signalToTrend,
  sortedWeeklySeries,
  USAGE_FIELD_LABEL,
} from "./format";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`player-${id}-h`} data-testid={`player-section-${id}`}>
      <h2 id={`player-${id}-h`} className="sl-label sl-mark mb-1">
        {title}
      </h2>
      <div className="flex flex-col gap-2 rounded-card border bg-card p-3">{children}</div>
    </section>
  );
}

export function PlayerDetailView({
  player,
  now,
  backHref,
}: {
  player: PlayerDetailResponse;
  now: Date;
  backHref: string;
}) {
  const { scoring, usage, consistency, momentum } = player;
  const weeklySeries = sortedWeeklySeries(scoring.weeklySeries);
  const signalTrend = signalToTrend(player.signal);

  return (
    <div className="flex flex-col gap-3" data-testid="player-detail">
      <div>
        <Link
          href={backHref}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-link underline-offset-4 hover:underline"
          data-testid="player-back-link"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Players
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">{player.name}</h1>
          <PositionBadge position={player.position} />
          <InjuryBadge status={player.injuryStatus} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {player.nflTeam ?? "No team"}
          {player.status ? ` · ${player.status}` : ""}
        </p>
        <DataFreshness freshness={player.freshness} now={now} className="mt-2" />
      </div>
      <StaleBanner freshness={player.freshness} now={now} />

      <div className="flex flex-wrap items-center gap-2" data-testid="player-signal-row">
        {signalTrend !== null ? (
          <TrendIndicator trend={signalTrend} detail={formatDelta(scoring.l3Delta)} />
        ) : (
          <span className="text-sm text-muted-foreground">Not enough games yet for a trend</span>
        )}
        <ReasonChips
          reasons={player.signalReasons}
          max={2}
          trailing={
            player.signalReasons.length > 0 ? (
              <WhySheet
                title="Trend signal"
                summary={
                  signalTrend !== null
                    ? { label: "Signal", value: player.signal ?? "—" }
                    : undefined
                }
                reasons={player.signalReasons}
              />
            ) : null
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Season PPG"
          value={formatPpg(scoring.seasonPpg)}
          sublabel={`${scoring.gamesPlayed} games`}
        />
        <StatCard
          label="Last 3 PPG"
          value={formatPpg(scoring.l3Ppg)}
          {...(scoring.l3Delta !== null ? { delta: { value: scoring.l3Delta } } : {})}
        />
        <StatCard
          label="Variation"
          value={formatConsistency(consistency.cv)}
          sublabel="week to week"
        />
        <StatCard
          label="Momentum"
          value={momentum.label}
          sublabel={`${formatNetCount(momentum.netCount)} net adds`}
        />
      </div>

      <Section id="scoring" title="Weekly scoring">
        {weeklySeries.length > 0 ? (
          <Sparkline
            label="Weekly fantasy points"
            values={weeklySeries.map((w) => w.actualPts)}
            labels={weeklySeries.map((w) => `Wk ${w.week}`)}
            reference={scoring.seasonPpg}
            referenceLabel="Season average"
            width={288}
            height={72}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No games played yet this season.</p>
        )}
        <ReasonChips
          reasons={scoring.reasons}
          max={2}
          trailing={
            scoring.reasons.length > 0 ? (
              <WhySheet title="Weekly scoring" reasons={scoring.reasons} />
            ) : null
          }
        />
      </Section>

      <Section id="usage" title="Usage">
        {usage.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {usage.reasons[0]?.label ?? "No usage data tracked for this position."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {usage.fields.map((f) => (
              <StatCard
                key={f.field}
                label={USAGE_FIELD_LABEL[f.field]}
                value={formatUsageValue(f.field, f.l3Value)}
                sublabel="Last 3 wks"
                {...(f.delta !== null
                  ? { delta: { value: f.delta, text: formatUsageDelta(f.field, f.delta) } }
                  : {})}
              />
            ))}
          </div>
        )}
        <ReasonChips
          reasons={usage.reasons}
          max={2}
          trailing={
            usage.reasons.length > 0 ? <WhySheet title="Usage" reasons={usage.reasons} /> : null
          }
        />
      </Section>

      <Section id="consistency" title="Boom and bust weeks">
        <div className="flex flex-wrap gap-2">
          <Badge variant="positive">{consistency.boomCount} boom</Badge>
          <Badge variant="negative">{consistency.bustCount} bust</Badge>
          <span className="text-sm text-muted-foreground">of {scoring.gamesPlayed} games</span>
        </div>
        <ReasonChips
          reasons={consistency.reasons}
          max={2}
          trailing={
            consistency.reasons.length > 0 ? (
              <WhySheet title="Boom and bust weeks" reasons={consistency.reasons} />
            ) : null
          }
        />
      </Section>

      <Section id="momentum" title="Sleeper momentum">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={MOMENTUM_TONE[momentum.label]}>{momentum.label}</Badge>
          <span className="text-sm tabular-nums text-muted-foreground">
            {momentum.addCount} adds · {momentum.dropCount} drops
          </span>
        </div>
        <ReasonChips
          reasons={momentum.reasons}
          max={2}
          trailing={
            momentum.reasons.length > 0 ? (
              <WhySheet title="Sleeper momentum" reasons={momentum.reasons} />
            ) : null
          }
        />
      </Section>

      <Section id="opponents" title="Next opponents">
        <p className="text-sm text-muted-foreground">
          Matchup grades for upcoming opponents aren't available yet.
        </p>
      </Section>
    </div>
  );
}
