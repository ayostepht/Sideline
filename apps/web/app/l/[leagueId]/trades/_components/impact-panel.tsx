import type { TradeTeamImpact } from "@sideline/shared";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "../../../../../lib/client/cn";
import { BEST_LINEUP_TIP, formatLineupDelta, formatPlayoff, playoffMissingText } from "./format";
import { InfoTip } from "./info-tip";

/** One team's change: best lineup before, after and delta, playoff odds, and any auto-drops. */
export function ImpactPanel({
  title,
  impact,
  possessive,
  testid,
  showTip = false,
}: {
  title: string;
  impact: TradeTeamImpact;
  /** "Your" or "Their", used in the sentence labels. */
  possessive: "Your" | "Their";
  testid: string;
  showTip?: boolean;
}) {
  const d = impact.rosLineupDelta;
  const Icon = d >= 0.05 ? ArrowUp : d <= -0.05 ? ArrowDown : Minus;
  const playoff = formatPlayoff(impact);
  const verb = possessive === "Your" ? "You drop" : "They drop";
  return (
    <section className="min-w-0 rounded-control border bg-card p-3" data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
        {showTip ? (
          <InfoTip label="What is best lineup?" text={BEST_LINEUP_TIP} testid="trade-lineup-info" />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 flex items-center gap-1 text-lg font-semibold tabular-nums",
          d >= 0.05 && "text-positive",
          d <= -0.05 && "text-negative",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span>{formatLineupDelta(d)}</span>
        <span className="text-sm font-normal text-muted-foreground">rest of season</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {possessive} best lineup:{" "}
        <span className="tabular-nums">
          {impact.rosLineupBefore.toFixed(1)} to {impact.rosLineupAfter.toFixed(1)} pts
        </span>
      </p>
      <p className="mt-1 text-sm tabular-nums" data-testid={`${testid}-playoff`}>
        {playoff ?? (
          <span className="text-muted-foreground">{playoffMissingText(impact.reasons)}</span>
        )}
      </p>
      {impact.dropped.length > 0 ? (
        <p className="mt-1 text-sm" data-testid={`${testid}-dropped`}>
          {verb} {impact.dropped.map((p) => p.name).join(", ")} to make room.
        </p>
      ) : null}
    </section>
  );
}
