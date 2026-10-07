import type { NextOpponents } from "@sideline/shared";
import { Info } from "lucide-react";
import { MatchupGrade } from "../../../../../components/matchup-grade";
import { Tooltip } from "../../../../../components/ui/tooltip";

const EXPLAINER =
  "Grades show how many points that defense allows to this position. They are context only and do not change projections.";

export function NextOpponentsBody({
  nextOpponents,
  position,
}: {
  nextOpponents: NextOpponents | undefined;
  position: string | null;
}) {
  if (nextOpponents === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Matchup grades for upcoming opponents aren't available yet.
      </p>
    );
  }
  if (nextOpponents.reasonUnavailable !== null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="player-next-opponents-empty">
        {nextOpponents.reasonUnavailable}
      </p>
    );
  }
  if (nextOpponents.weeks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="player-next-opponents-empty">
        No upcoming games.
      </p>
    );
  }
  const pos = position ? `${position}s` : "this position";
  return (
    <>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Tooltip content={EXPLAINER}>
          <button
            type="button"
            aria-label="About matchup grades"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Info className="size-4" aria-hidden />
          </button>
        </Tooltip>
        <span className="pt-0.5">{EXPLAINER}</span>
      </p>
      <ul className="flex flex-col divide-y" data-testid="player-next-opponents">
        {nextOpponents.weeks.map((w) => (
          <li
            key={w.week}
            data-testid="player-next-opponent-row"
            className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 font-medium tabular-nums">Wk {w.week}</span>
              {w.bye ? (
                <span className="font-medium">Bye</span>
              ) : (
                <span>
                  {w.home === false ? "at" : "vs"} {w.opponent ?? "TBD"}
                </span>
              )}
              {!w.bye && w.grade !== null ? (
                <MatchupGrade grade={w.grade} className="ml-auto" />
              ) : null}
              {!w.bye && w.grade === null ? (
                <span className="ml-auto text-xs text-muted-foreground">Not graded yet</span>
              ) : null}
            </div>
            {!w.bye && w.grade !== null && w.ptsAllowedPg !== null ? (
              <p className="pl-14 text-xs text-muted-foreground tabular-nums">
                {w.ptsAllowedPg.toFixed(1)} pts/g allowed to {pos}
                {w.rank !== null && w.totalTeams !== null
                  ? `, rank ${w.rank} of ${w.totalTeams}`
                  : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
