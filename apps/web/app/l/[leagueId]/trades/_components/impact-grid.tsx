import type { TradeTeamImpact } from "@sideline/shared";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "../../../../../lib/client/cn";
import { formatPts } from "./format";

/** Change cell: arrow plus signed text; a drop also reads "Down" to screen readers. */
export function Change({ value, text }: { value: number; text: string }) {
  const up = value >= 0.05;
  const down = value <= -0.05;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-semibold",
        up && "text-positive",
        down && "text-negative",
      )}
      data-change={up ? "up" : down ? "down" : "flat"}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{up ? "Up " : down ? "Down " : "No change "}</span>
      {text}
    </span>
  );
}

const pct = (n: number): string => `${String(Math.round(n * 100))}%`;

/** Playoff change in whole percent, with its own sign. */
function pctChange(before: number, after: number): { value: number; text: string } {
  const d = Math.round(after * 100) - Math.round(before * 100);
  return { value: d, text: `${d > 0 ? "+" : ""}${String(d)}%` };
}

/** Aligned before, after, change grid for one team (a real table, so it reads well). */
export function ImpactGrid({
  caption,
  impact,
  testid,
}: {
  caption: string;
  impact: Pick<
    TradeTeamImpact,
    "rosLineupBefore" | "rosLineupAfter" | "rosLineupDelta" | "playoffPctBefore" | "playoffPctAfter"
  >;
  testid?: string;
}) {
  const hasPlayoff = impact.playoffPctBefore !== null && impact.playoffPctAfter !== null;
  const playoff =
    impact.playoffPctBefore !== null && impact.playoffPctAfter !== null
      ? pctChange(impact.playoffPctBefore, impact.playoffPctAfter)
      : null;
  return (
    <table
      className="w-full table-fixed text-sm tabular-nums"
      data-testid={testid}
      data-has-playoff={hasPlayoff ? "true" : "false"}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="w-[34%] py-0.5 text-left font-normal">
            <span className="sr-only">Measure</span>
          </th>
          <th scope="col" className="py-0.5 text-right font-normal">
            Before
          </th>
          <th scope="col" className="py-0.5 text-right font-normal">
            After
          </th>
          <th scope="col" className="w-[30%] py-0.5 text-right font-normal">
            Change
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="py-0.5 text-left font-normal">
            Lineup pts
          </th>
          <td className="py-0.5 text-right">{impact.rosLineupBefore.toFixed(1)}</td>
          <td className="py-0.5 text-right">{impact.rosLineupAfter.toFixed(1)}</td>
          <td className="py-0.5 text-right">
            <Change value={impact.rosLineupDelta} text={formatPts(impact.rosLineupDelta)} />
          </td>
        </tr>
        {playoff && impact.playoffPctBefore !== null && impact.playoffPctAfter !== null ? (
          <tr>
            <th scope="row" className="py-0.5 text-left font-normal">
              Playoffs
            </th>
            <td className="py-0.5 text-right">{pct(impact.playoffPctBefore)}</td>
            <td className="py-0.5 text-right">{pct(impact.playoffPctAfter)}</td>
            <td className="py-0.5 text-right">
              <Change value={playoff.value} text={playoff.text} />
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
