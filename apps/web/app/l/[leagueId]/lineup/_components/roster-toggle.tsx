import type { LineupModeChoice } from "@sideline/shared";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { buildLineupHref } from "./format";

/**
 * LINEUP-9: lets the viewer flip between their own lineup and their current opponent's
 * (read-only), or back, via `?roster=`. Renders nothing when there is nothing to switch to.
 */
export function RosterToggle({
  leagueId,
  week,
  mode,
  mine,
  opponentRosterId,
  opponentName,
}: {
  leagueId: string;
  week: number | null;
  mode: LineupModeChoice;
  mine: boolean;
  opponentRosterId: number | null;
  opponentName: string | null;
}) {
  const linkClass =
    "inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-link underline-offset-4 hover:underline";

  if (mine) {
    if (opponentRosterId === null) return null;
    return (
      <Link
        href={buildLineupHref(leagueId, { week, mode, roster: opponentRosterId })}
        className={linkClass}
        data-testid="lineup-roster-toggle-opponent"
      >
        <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
        View {opponentName ?? "opponent"}&apos;s lineup
      </Link>
    );
  }

  return (
    <Link
      href={buildLineupHref(leagueId, { week, mode })}
      className={linkClass}
      data-testid="lineup-roster-toggle-mine"
    >
      <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
      Back to my lineup
    </Link>
  );
}
