import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";

export interface ScoreboardStat {
  /** Small uppercase tracked label, e.g. "Record". */
  label: string;
  /** The stat's value. Already formatted; wrap in tabular-nums-friendly markup. */
  value: ReactNode;
}

/**
 * ADR-011 "scoreboard feel": bold tabular-nums numbers over small uppercase tracked labels,
 * thin dividers between stats, dense. Used for the Record / PF / Rank strip on Home and My Team.
 */
export function ScoreboardHero({
  stats,
  className,
}: {
  stats: readonly ScoreboardStat[];
  className?: string;
}) {
  return (
    <dl
      className={cn("flex divide-x rounded-control border bg-muted", className)}
      data-testid="scoreboard-hero"
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1.5"
        >
          <dt className="sl-label">{s.label}</dt>
          <dd className="text-base font-bold leading-6 tabular-nums sm:text-xl">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
