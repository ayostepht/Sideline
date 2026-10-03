import { lineupSummary } from "./format";

/**
 * The one lime-accent element on this page (ADR-011): the top recommendation number, shown
 * before any supporting evidence (CLAUDE.md "insight first").
 */
export function LineupSummaryBanner({
  pointDelta,
  swapCount,
}: {
  pointDelta: number;
  swapCount: number;
}) {
  return (
    <div
      className="rounded-card bg-accent-soft px-3 py-2 text-accent-soft-foreground"
      data-testid="lineup-summary"
    >
      <p className="text-base font-bold tabular-nums sm:text-lg">
        {lineupSummary(pointDelta, swapCount)}
      </p>
    </div>
  );
}
