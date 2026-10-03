import type { LineupMode } from "@sideline/shared";
import Link from "next/link";
import { cn } from "../../../../../lib/client/cn";
import { buildLineupHref, MODE_LABEL } from "./format";

const MODES: readonly LineupMode[] = ["projected", "safe", "upside"];

/**
 * Projected/Safe/Upside toggle (LINEUP-5), as real links so the page stays deep-linkable and
 * server-rendered: switching modes is a navigation, not client state.
 */
export function ModeToggle({
  leagueId,
  week,
  mode,
  roster,
}: {
  leagueId: string;
  week: number | null;
  mode: LineupMode;
  roster?: number;
}) {
  return (
    <div
      role="group"
      aria-label="Lineup value mode"
      data-testid="lineup-mode-toggle"
      className="inline-flex max-w-full gap-0.5 rounded-control bg-muted p-0.5"
    >
      {MODES.map((m) => {
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
            data-testid={`lineup-mode-toggle-${m}`}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 text-sm font-medium transition-colors duration-150",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card",
            )}
          >
            {MODE_LABEL[m]}
          </Link>
        );
      })}
    </div>
  );
}
