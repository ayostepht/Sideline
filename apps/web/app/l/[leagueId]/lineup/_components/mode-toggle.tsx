import type { LineupModeChoice, Reason } from "@sideline/shared";
import Link from "next/link";
import { cn } from "../../../../../lib/client/cn";
import { buildLineupHref, MODE_CHOICES, MODE_LABEL } from "./format";

export const AUTO_EXPLAINER =
  "Auto picks Upside when you are likely to lose, Safe when you are likely to win, otherwise Projected.";

/**
 * Auto/Projected/Safe/Upside toggle (LINEUP-5, AUTO-1), as real links so the page stays
 * deep-linkable and server-rendered: switching modes is a navigation, not client state.
 * `mode` is the REQUESTED mode; `reason` says what Auto resolved to.
 */
export function ModeToggle({
  leagueId,
  week,
  mode,
  reason = null,
  roster,
}: {
  leagueId: string;
  week: number | null;
  mode: LineupModeChoice;
  reason?: Reason | null;
  roster?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        role="group"
        aria-label="Lineup value mode"
        data-testid="lineup-mode-toggle"
        className="inline-flex max-w-full gap-0.5 self-start rounded-control bg-muted p-0.5"
      >
        {MODE_CHOICES.map((m) => {
          const active = m === mode;
          return (
            <Link
              key={m}
              href={buildLineupHref(leagueId, {
                week,
                mode: m,
                ...(roster !== undefined ? { roster } : {}),
              })}
              aria-current={active ? "true" : undefined}
              aria-describedby={m === "auto" ? "lineup-auto-explainer" : undefined}
              title={m === "auto" ? AUTO_EXPLAINER : undefined}
              data-testid={`lineup-mode-toggle-${m}`}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-2.5 text-sm font-medium transition-colors duration-150 sm:px-3",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card",
              )}
            >
              {MODE_LABEL[m]}
            </Link>
          );
        })}
      </div>
      <span id="lineup-auto-explainer" className="sr-only">
        {AUTO_EXPLAINER}
      </span>
      {reason ? (
        <p className="text-sm text-muted-foreground" data-testid="lineup-auto-reason">
          {reason.label}
        </p>
      ) : null}
    </div>
  );
}
