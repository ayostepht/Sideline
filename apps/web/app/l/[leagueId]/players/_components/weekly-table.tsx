import type { PlayerWeekRow } from "@sideline/shared";
import { Tooltip } from "../../../../../components/ui/tooltip";
import {
  formatOpponent,
  formatWeekProj,
  formatWeekPts,
  formatWeekRank,
  weekResultLabel,
  weekRowKind,
} from "./player-card-format";

const HEAD_TIPS = {
  Proj: "Projected points from before kickoff, using your league scoring.",
  Rank: "Where the player finished at their position that week. WR12 means the 12th best receiver.",
  Result:
    "Boom is an unusually big week for this player. Bust is an unusually weak one, compared with their own average.",
} as const;

function HeadWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4"
      >
        {label}
      </button>
    </Tooltip>
  );
}

const TH = "sticky top-0 z-10 bg-card px-2 text-xs font-semibold text-muted-foreground";

export function WeeklyTable({
  rows,
  position,
}: {
  rows: PlayerWeekRow[];
  position: string | null;
}) {
  return (
    <div
      className="max-h-[22rem] max-w-xl overflow-auto rounded-control border"
      // Scrollable region must be keyboard reachable.
      tabIndex={0}
      role="region"
      aria-label="Weekly results, scrollable"
      data-testid="player-weekly-table"
    >
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">Weekly results, newest week first</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={`${TH} py-2 text-left`}>
              Week
            </th>
            <th scope="col" className={`${TH} py-2 text-left`}>
              Opp
            </th>
            <th scope="col" className={`${TH} py-2 text-right`}>
              Pts
            </th>
            <th scope="col" className={`${TH} hidden text-right sm:table-cell`}>
              <HeadWithTip label="Proj" tip={HEAD_TIPS.Proj} />
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <HeadWithTip label="Rank" tip={HEAD_TIPS.Rank} />
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <HeadWithTip label="Result" tip={HEAD_TIPS.Result} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const kind = weekRowKind(r);
            const result = weekResultLabel(r);
            const muted = kind === "bye" || kind === "dnp";
            return (
              <tr key={r.week} className="border-b last:border-b-0" data-testid="player-weekly-row">
                <th scope="row" className="px-2 py-2 text-left font-medium">
                  {r.week}
                </th>
                <td className="px-2 py-2">{formatOpponent(r)}</td>
                <td
                  className={`px-2 py-2 text-right ${muted ? "text-muted-foreground" : "font-semibold"}`}
                >
                  {kind === "live" ? (
                    <span className="mr-1 rounded-control bg-muted px-1 py-0.5 text-[11px] font-semibold uppercase text-foreground">
                      Live
                    </span>
                  ) : null}
                  {formatWeekPts(r)}
                  {/* Below sm the Proj column is hidden to fit 390px; show it under Pts instead. */}
                  {r.projectedPts !== null ? (
                    <span className="block text-[11px] font-normal text-muted-foreground sm:hidden">
                      proj {formatWeekProj(r)}
                    </span>
                  ) : null}
                </td>
                <td className="hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">
                  {formatWeekProj(r)}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">
                  {formatWeekRank(r, position)}
                </td>
                <td className="px-2 py-2 text-right">
                  {result === "Boom" ? (
                    <span className="font-semibold text-positive">Boom</span>
                  ) : result === "Bust" ? (
                    <span className="font-semibold text-negative">Bust</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
