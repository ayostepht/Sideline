import type { TradeSuggestion, TradeTeamImpact } from "@sideline/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "../../../../../lib/client/cn";
import { FairnessBadge } from "./fairness-badge";
import { formatLineupDelta, formatPlayoff, mergeReasons, tradesHref } from "./format";
import { ReasonsBlock } from "./reasons-block";
import { TradePlayers } from "./trade-players";

function SideLine({
  label,
  impact,
  testid,
}: {
  label: "Your" | "Their";
  impact: TradeTeamImpact;
  testid: string;
}) {
  const playoff = formatPlayoff(impact);
  return (
    <div className="min-w-0" data-testid={testid}>
      <p className="text-sm">
        {label} best lineup{" "}
        <strong className="font-semibold tabular-nums">
          {formatLineupDelta(impact.rosLineupDelta)}
        </strong>{" "}
        rest of season
      </p>
      {label === "Your" && playoff ? (
        <p className="text-sm text-muted-foreground tabular-nums">{playoff}</p>
      ) : null}
    </div>
  );
}

export function SuggestionCard({
  leagueId,
  suggestion: s,
  teamName,
  top,
}: {
  leagueId: string;
  suggestion: TradeSuggestion;
  teamName: string;
  top: boolean;
}) {
  const href = tradesHref(leagueId, "analyzer", {
    other: s.otherRosterId,
    give: s.give.map((p) => p.playerId),
    get: s.get.map((p) => p.playerId),
  });
  return (
    <li
      className={cn("rounded-control border bg-card p-3", top && "border-primary")}
      data-testid="trade-suggestion"
      data-top={top ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">With {teamName}</p>
        <div className="flex items-center gap-1">
          {top ? (
            <span
              className="inline-flex items-center rounded-control bg-primary px-2 py-1 text-[13px] font-bold leading-4 text-primary-foreground sm:py-0.5 sm:text-xs"
              data-testid="trade-top-pick"
            >
              Top pick
            </span>
          ) : null}
          <FairnessBadge fairness={s.fairness} />
        </div>
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <TradePlayers heading="You give" players={s.give} testid="trade-give" />
        <TradePlayers heading="You get" players={s.get} testid="trade-get" />
      </div>
      <div className="mt-2 grid gap-1 border-t pt-2 sm:grid-cols-2">
        <SideLine label="Your" impact={s.mine} testid="trade-mine" />
        <SideLine label="Their" impact={s.theirs} testid="trade-theirs" />
      </div>
      <div className="mt-1">
        <ReasonsBlock reasons={mergeReasons(s.reasons, s.mine.reasons, s.theirs.reasons)} />
      </div>
      <Link
        href={href}
        data-testid="trade-open-analyzer"
        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
      >
        Open in Analyzer
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </li>
  );
}
