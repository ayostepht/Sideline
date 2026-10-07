import type { NextOpponents } from "@sideline/shared";
import { Info } from "lucide-react";
import { MatchupGrade } from "../../../../../components/matchup-grade";

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
    <div className="max-w-xl">
      <ul className="flex flex-col divide-y" data-testid="player-next-opponents">
        {nextOpponents.weeks.map((w) => (
          <li
            key={w.week}
            data-testid="player-next-opponent-row"
            className="grid grid-cols-[3rem_1fr] items-center gap-y-1 py-2 text-sm first:pt-0 last:pb-0"
          >
            <span className="font-medium tabular-nums">Wk {w.week}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {w.bye ? (
                <span className="font-medium">Bye</span>
              ) : (
                <span>
                  {w.home === false ? "at" : "vs"} {w.opponent ?? "TBD"}
                </span>
              )}
              {!w.bye && w.grade !== null ? <MatchupGrade grade={w.grade} /> : null}
              {!w.bye && w.grade === null ? (
                <span className="text-xs text-muted-foreground">Not graded yet</span>
              ) : null}
            </div>
            {!w.bye && w.grade !== null && w.ptsAllowedPg !== null ? (
              <p className="col-start-2 text-xs text-muted-foreground tabular-nums">
                {w.ptsAllowedPg.toFixed(1)} pts per game allowed to {pos}
                {w.rank !== null && w.totalTeams !== null
                  ? `, rank ${w.rank} of ${w.totalTeams}`
                  : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p
        className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"
        data-testid="player-next-opponents-note"
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{EXPLAINER}</span>
      </p>
    </div>
  );
}
