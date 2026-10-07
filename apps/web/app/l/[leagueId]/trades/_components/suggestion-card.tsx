import type { TradeSuggestion } from "@sideline/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "../../../../../components/ui/button";
import { cn } from "../../../../../lib/client/cn";
import { FairnessBadge } from "./fairness-badge";
import { FAIRNESS_TIP, mergeReasons, tradesHref } from "./format";
import { ImpactGrid } from "./impact-grid";
import { InfoTip } from "./info-tip";
import { ReasonsBlock } from "./reasons-block";
import { TradePlayers } from "./trade-players";

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
  // Never recommend a trade the app itself calls lopsided.
  const isTop = top && s.fairness !== "lopsided";
  const href = tradesHref(leagueId, "analyzer", {
    other: s.otherRosterId,
    give: s.give.map((p) => p.playerId),
    get: s.get.map((p) => p.playerId),
  });
  return (
    <li
      className={cn("rounded-control border bg-card p-3", isTop && "border-primary")}
      data-testid="trade-suggestion"
      data-top={isTop ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h3 className="min-w-0 truncate text-sm font-semibold" data-testid="trade-with">
          With {teamName}
        </h3>
        <div className="flex items-center gap-1">
          {isTop ? (
            <span
              className="inline-flex items-center rounded-control bg-primary px-2 py-1 text-[13px] font-bold leading-4 text-primary-foreground sm:py-0.5 sm:text-xs"
              data-testid="trade-top-pick"
            >
              Top pick
            </span>
          ) : null}
          <FairnessBadge fairness={s.fairness} />
          <InfoTip
            label="What does fairness mean?"
            text={FAIRNESS_TIP}
            testid="trade-fairness-info"
          />
        </div>
      </div>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <TradePlayers heading="You give" players={s.give} testid="trade-give" />
        <TradePlayers heading="You get" players={s.get} testid="trade-get" />
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-3 border-t pt-2 sm:grid-cols-2">
        <div className="min-w-0" data-testid="trade-mine">
          <p className="text-xs font-semibold text-muted-foreground">
            Your best lineup, rest of season
          </p>
          <ImpactGrid caption="Your best lineup before and after" impact={s.mine} />
        </div>
        <div className="min-w-0" data-testid="trade-theirs">
          <p className="text-xs font-semibold text-muted-foreground">
            Their best lineup, rest of season
          </p>
          <ImpactGrid caption="Their best lineup before and after" impact={s.theirs} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <ReasonsBlock reasons={mergeReasons(s.reasons, s.mine.reasons, s.theirs.reasons)} />
        </div>
        <Link
          href={href}
          data-testid="trade-open-analyzer"
          className={cn(buttonVariants({ variant: "outline", size: "md" }), "shrink-0")}
        >
          Open in Analyzer
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
