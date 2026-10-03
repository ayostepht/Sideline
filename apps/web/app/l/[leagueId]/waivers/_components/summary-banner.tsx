import type { WaiverCandidate } from "@sideline/shared";
import { topTargetSummary } from "./format";

/**
 * The one lime-accent element on this page (ADR-011, matching Lineup's `LineupSummaryBanner`):
 * the top "for my team" recommendation, shown before any supporting evidence. Always reflects the
 * "For my team" ranking regardless of which tab is currently selected in `WaiverBoard`, since it's
 * a single static headline, not itself filterable.
 */
export function WaiversSummaryBanner({ forMyTeam }: { forMyTeam: readonly WaiverCandidate[] }) {
  const summary = topTargetSummary(forMyTeam);
  return (
    <div
      className="rounded-control bg-primary px-3 py-2 text-primary-foreground"
      data-testid="waivers-summary"
    >
      <p className="text-base font-bold tabular-nums sm:text-lg">
        {summary ?? "No strong waiver targets for your team this week"}
      </p>
    </div>
  );
}
