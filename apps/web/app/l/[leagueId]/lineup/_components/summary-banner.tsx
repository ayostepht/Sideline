import { lineupSummary } from "./format";

/**
 * The one lime-accent element on this page (ADR-011): the top recommendation number, shown
 * before any supporting evidence (CLAUDE.md "insight first"). Static and non-interactive (unlike
 * Home's matching card, which is a link), but matches its vivid bg-primary/text-primary-foreground
 * fill and bold scoreboard weight so both pages present their "one recommendation" accent the same way.
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
      className="rounded-control bg-primary px-3 py-2 text-primary-foreground"
      data-testid="lineup-summary"
    >
      <p className="text-base font-bold tabular-nums sm:text-lg">
        {lineupSummary(pointDelta, swapCount)}
      </p>
    </div>
  );
}
