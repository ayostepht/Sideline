import type { LineupPlayer, LineupSwap } from "@sideline/shared";
import { ArrowRight } from "lucide-react";
import { cn } from "../../../../../lib/client/cn";
import { formatSignedPoints, playerById, swapDelta } from "./format";

function nameOrEmpty(players: readonly LineupPlayer[], id: string | null): string {
  if (id === null) return "Empty slot";
  return playerById(players, id)?.name ?? `Player ${id}`;
}

/** The swaps to make (LINEUP-6): current starter out, optimal starter in, per slot. */
export function SwapList({
  swaps,
  players,
}: {
  swaps: readonly LineupSwap[];
  players: readonly LineupPlayer[];
}) {
  if (swaps.length === 0) return null;
  return (
    <section aria-labelledby="lineup-swaps-h" data-testid="lineup-swaps">
      <h2 id="lineup-swaps-h" className="sl-label sl-mark mb-1">
        Swaps to make
      </h2>
      <ul className="flex flex-col divide-y rounded-card border bg-card">
        {swaps.map((swap, i) => {
          const delta = swapDelta(players, swap);
          const outName = nameOrEmpty(players, swap.playerIdOut);
          const inName = nameOrEmpty(players, swap.playerIdIn);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: slot types can repeat (two FLEX)
              key={`${swap.slotIndex}-${swap.slotType}-${i}`}
              className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 text-sm"
              data-testid="lineup-swap-row"
            >
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {swap.slotType}
              </span>
              <span className="min-w-0 flex-1 truncate" title={outName}>
                {outName}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium" title={inName}>
                {inName}
              </span>
              {delta !== null ? (
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    delta >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {formatSignedPoints(delta)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
