import Link from "next/link";
import { cn } from "../../../../../lib/client/cn";
import { tradesHref, type TradesTab } from "./format";

const TABS: readonly { key: TradesTab; label: string }[] = [
  { key: "finder", label: "Finder" },
  { key: "analyzer", label: "Analyzer" },
];

/** Finder or Analyzer, as links so the tab is in the URL (`?tab=analyzer`). */
export function TradesTabs({ leagueId, tab }: { leagueId: string; tab: TradesTab }) {
  return (
    <nav aria-label="Trades view" data-testid="trades-tabs">
      <div className="inline-flex max-w-full gap-0.5 rounded-control bg-muted p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tradesHref(leagueId, t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            data-testid={`trades-tab-${t.key}`}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-4 text-sm font-medium transition-colors duration-150",
              t.key === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-card",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
